import { prisma } from "../database/prisma.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type {
  ActivityDeviceInfo,
  ActivityLogRecord,
  RecordActivityInput,
} from "./activity-log.types.js";

const activityLogSelection = {
  id: true,
  userId: true,
  organizationId: true,
  module: true,
  entityName: true,
  recordId: true,
  action: true,
  ipAddress: true,
  userAgent: true,
  deviceInfo: true,
  performedAt: true,
  remarks: true,
} as const;

interface ActivityLogDatabaseRecord {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly module: string;
  readonly entityName: string;
  readonly recordId: string | null;
  readonly action: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly deviceInfo: unknown;
  readonly performedAt: Date;
  readonly remarks: string | null;
}

function mapDeviceInfo(value: unknown): ActivityDeviceInfo | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const platform =
    typeof candidate.platform === "string" ? candidate.platform : undefined;
  const mobile =
    typeof candidate.mobile === "boolean" ? candidate.mobile : undefined;

  return platform === undefined && mobile === undefined
    ? null
    : Object.freeze({ platform, mobile });
}

function mapActivityLog(record: ActivityLogDatabaseRecord): ActivityLogRecord {
  return Object.freeze({
    ...record,
    deviceInfo: mapDeviceInfo(record.deviceInfo),
  });
}

export class ActivityLogRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async append(input: RecordActivityInput): Promise<ActivityLogRecord> {
    const record = await this.database.activityLog.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        module: input.module,
        entityName: input.entityName,
        recordId: input.recordId,
        action: input.action,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        deviceInfo: input.deviceInfo ? { ...input.deviceInfo } : undefined,
        performedAt: input.performedAt,
        remarks: input.remarks,
      },
      select: activityLogSelection,
    });
    return mapActivityLog(record);
  }

  async findByUser(
    userId: string,
    organizationId: string,
  ): Promise<readonly ActivityLogRecord[]> {
    return this.findMany({ userId, organizationId });
  }

  async findByOrganization(
    organizationId: string,
  ): Promise<readonly ActivityLogRecord[]> {
    return this.findMany({ organizationId });
  }

  async findByModule(
    module: string,
    organizationId: string,
  ): Promise<readonly ActivityLogRecord[]> {
    return this.findMany({ module, organizationId });
  }

  async findByEntity(
    entityName: string,
    organizationId: string,
  ): Promise<readonly ActivityLogRecord[]> {
    return this.findMany({ entityName, organizationId });
  }

  async findByRecord(
    entityName: string,
    recordId: string,
    organizationId: string,
  ): Promise<readonly ActivityLogRecord[]> {
    return this.findMany({ entityName, recordId, organizationId });
  }

  async findByDateRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<readonly ActivityLogRecord[]> {
    return this.findMany({
      organizationId,
      performedAt: { gte: from, lte: to },
    });
  }

  private async findMany(
    where: NonNullable<
      Parameters<PrismaClient["activityLog"]["findMany"]>[0]
    >["where"],
  ): Promise<readonly ActivityLogRecord[]> {
    const records = await this.database.activityLog.findMany({
      where,
      orderBy: [{ performedAt: "desc" }, { id: "desc" }],
      select: activityLogSelection,
    });
    return Object.freeze(records.map(mapActivityLog));
  }
}

export const activityLogRepository = new ActivityLogRepository();
