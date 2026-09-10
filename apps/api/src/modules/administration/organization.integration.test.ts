import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import app from "../../app.js";
import { accessTokenService } from "../../core/auth/access-token.service.js";
import { prisma } from "../../core/database/prisma.js";
import { ORGANIZATION_MANAGEMENT_PERMISSION } from "./types/organization.types.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

describe("Organization Management HTTP integration", () => {
  let server: Server;
  let baseUrl: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let userId: string;
  let roleId: string;
  let permissionId: string;
  let rolePermissionId: string;
  let assignmentId: string;
  let sessionId: string;
  let accessToken: string;
  let createdPermission = false;
  let priorPermissionStatus: string | undefined;

  async function request(
    method: "GET" | "PATCH",
    body?: Readonly<Record<string, unknown>>,
    token: string | null = accessToken,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/administration/organization`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "User-Agent": "Organization-Integration-Test/1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        organizationCode: `API-${suffix}`,
        organizationName: `API Organization ${suffix}`,
        status: "Active",
      },
    });
    organizationId = organization.id;
    const department = await prisma.department.create({
      data: {
        organizationId,
        departmentCode: `API-${suffix}`,
        departmentName: `API Department ${suffix}`,
        status: "Active",
      },
    });
    const user = await prisma.user.create({
      data: {
        organizationId,
        departmentId: department.id,
        firstName: "Organization API",
        username: `api-user-${suffix}`,
        email: `api-user-${suffix}@test.invalid`,
        passwordHash: "test-only-password-hash",
        status: "Active",
      },
    });
    userId = user.id;

    const role = await prisma.role.create({
      data: {
        organizationId,
        roleCode: `ADMIN-${suffix}`,
        roleName: `Administrator ${suffix}`,
        status: "Active",
        createdById: userId,
      },
    });
    roleId = role.id;

    let permission = await prisma.permission.findUnique({
      where: { permissionCode: ORGANIZATION_MANAGEMENT_PERMISSION },
    });
    if (!permission) {
      permission = await prisma.permission.create({
        data: {
          permissionCode: ORGANIZATION_MANAGEMENT_PERMISSION,
          permissionName: "Manage Administration",
          module: "Administration",
          resource: "administration",
          action: "manage",
          status: "Active",
          createdById: userId,
        },
      });
      createdPermission = true;
    } else {
      priorPermissionStatus = permission.status;
    }
    permissionId = permission.id;
    await prisma.permission.update({
      where: { id: permissionId },
      data: { status: "Active" },
    });

    const rolePermission = await prisma.rolePermission.create({
      data: {
        organizationId,
        roleId,
        permissionId,
        assignedById: userId,
        status: "Active",
      },
    });
    rolePermissionId = rolePermission.id;
    const assignment = await prisma.roleAssignment.create({
      data: {
        organizationId,
        userId,
        roleId,
        status: "Active",
        createdById: userId,
      },
    });
    assignmentId = assignment.id;
    const session = await prisma.userSession.create({
      data: {
        organizationId,
        userId,
        sessionTokenHash: `organization-api-session-${suffix}`,
        expiresAt: new Date(Date.now() + 60 * 60_000),
        status: "Active",
      },
    });
    sessionId = session.id;
    accessToken = await accessTokenService.sign({
      userId,
      organizationId,
      sessionId,
    });

    const otherOrganization = await prisma.organization.create({
      data: {
        organizationCode: `API-OTHER-${suffix}`,
        organizationName: `API Other Organization ${suffix}`,
        status: "Active",
      },
    });
    otherOrganizationId = otherOrganization.id;

    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (!organizationId || !otherOrganizationId) {
      await prisma.$disconnect();
      return;
    }
    await prisma.activityLog.deleteMany({ where: { organizationId } });
    await prisma.userSession.deleteMany({ where: { organizationId } });
    await prisma.roleAssignment.deleteMany({ where: { organizationId } });
    await prisma.rolePermission.deleteMany({ where: { organizationId } });
    await prisma.role.deleteMany({ where: { organizationId } });
    if (createdPermission) {
      await prisma.permission.delete({ where: { id: permissionId } });
    } else if (priorPermissionStatus !== undefined) {
      await prisma.permission.update({
        where: { id: permissionId },
        data: { status: priorPermissionStatus },
      });
    }
    await prisma.organization.updateMany({
      where: { id: { in: [organizationId, otherOrganizationId] } },
      data: { createdById: null, updatedById: null },
    });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.department.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationId, otherOrganizationId] } },
    });
    await prisma.$disconnect();
  });

  it.each([
    ["missing", null],
    ["invalid", "invalid-access-token"],
  ])("rejects %s authentication", async (_label, token) => {
    const response = await request("GET", undefined, token);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "AUTHENTICATION_ERROR" },
    });
  });

  it("returns only the authenticated tenant organization", async () => {
    const response = await request("GET");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      readonly success: boolean;
      readonly data: Readonly<Record<string, unknown>>;
    };
    expect(body).toMatchObject({
      success: true,
      data: {
        id: organizationId,
        organizationCode: `API-${suffix}`,
        organizationName: `API Organization ${suffix}`,
        status: "Active",
      },
    });
    expect(Object.keys(body.data).sort()).toEqual(
      [
        "address",
        "cityId",
        "countryId",
        "createdAt",
        "createdById",
        "email",
        "gstNumber",
        "id",
        "legalName",
        "organizationCode",
        "organizationName",
        "panNumber",
        "phone",
        "pincode",
        "stateId",
        "status",
        "updatedAt",
        "updatedById",
        "website",
      ].sort(),
    );
    await expect(
      prisma.activityLog.count({
        where: {
          organizationId,
          module: "Administration",
          entityName: "Organization",
        },
      }),
    ).resolves.toBe(0);
  });

  it("updates approved fields from context and creates exactly one audit record", async () => {
    const response = await request("PATCH", {
      legalName: `API Legal Organization ${suffix}`,
      phone: "9876543210",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: organizationId,
        legalName: `API Legal Organization ${suffix}`,
        phone: "9876543210",
        updatedById: userId,
      },
    });
    await expect(
      prisma.activityLog.count({
        where: {
          organizationId,
          userId,
          entityName: "Organization",
          recordId: organizationId,
          action: "OrganizationUpdated",
        },
      }),
    ).resolves.toBe(1);
  });

  it.each<{
    label: string;
    status: "Active" | "Inactive" | "Revoked";
    expiresAt: Date | null;
  }>([
    {
      label: "expired",
      status: "Active",
      expiresAt: new Date(Date.now() - 60_000),
    },
    { label: "revoked", status: "Revoked", expiresAt: null },
    { label: "inactive", status: "Inactive", expiresAt: null },
  ])(
    "denies an $label role assignment",
    async ({ status, expiresAt }) => {
      await prisma.roleAssignment.update({
        where: { id: assignmentId },
        data: { status, expiresAt },
      });

      const response = await request("GET");
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: { code: "AUTHORIZATION_ERROR" },
      });

      await prisma.roleAssignment.update({
        where: { id: assignmentId },
        data: { status: "Active", expiresAt: null },
      });
    },
  );

  it("denies a user without the required permission", async () => {
    await prisma.rolePermission.update({
      where: { id: rolePermissionId },
      data: { status: "Inactive" },
    });
    const response = await request("GET");
    expect(response.status).toBe(403);
    await prisma.rolePermission.update({
      where: { id: rolePermissionId },
      data: { status: "Active" },
    });
  });

  it.each([
    [{ status: "Inactive" }],
    [{ organizationCode: "CHANGED" }],
    [{ organizationId: "11111111-1111-4111-8111-111111111111" }],
    [{ updatedById: randomUUID() }],
    [{ unknownField: "value" }],
  ])("rejects non-approved input %p", async (body) => {
    const response = await request("PATCH", body);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("rejects invalid field values and an empty update", async () => {
    const invalid = await request("PATCH", {
      organizationName: "x".repeat(151),
    });
    expect(invalid.status).toBe(400);
    const empty = await request("PATCH", {});
    expect(empty.status).toBe(400);
  });

  it("preserves explicit null so nullable fields can be cleared", async () => {
    const response = await request("PATCH", { legalName: null });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: organizationId, legalName: null },
    });
  });

  it("returns a standardized validation error for invalid geography", async () => {
    const response = await request("PATCH", {
      countryId: randomUUID(),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("returns a standardized conflict without leaking database details", async () => {
    const response = await request("PATCH", {
      organizationName: `API Other Organization ${suffix}`,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "CONFLICT",
        message: "Organization details conflict with an existing record.",
      },
    });
  });

  it("does not allow the body to select or modify another organization", async () => {
    const before = await prisma.organization.findUniqueOrThrow({
      where: { id: otherOrganizationId },
      select: { organizationName: true },
    });
    const response = await request("PATCH", {
      organizationId: otherOrganizationId,
      organizationName: "Cross Tenant Attempt",
    });

    expect(response.status).toBe(400);
    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: otherOrganizationId },
        select: { organizationName: true },
      }),
    ).resolves.toEqual(before);
  });
});
