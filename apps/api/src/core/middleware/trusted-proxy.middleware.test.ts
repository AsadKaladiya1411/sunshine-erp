import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import * as configuration from "@sunshine-erp/config";
import { getActivityRequestMetadata } from "../audit/request-metadata.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
    ),
  );
  jest.unstable_mockModule("@sunshine-erp/config", () => configuration);
  jest.resetModules();
  jest.restoreAllMocks();
});

async function startApi(trustedProxies?: string) {
  const env = configuration.parseEnvironment({
    NODE_ENV: "test",
    DATABASE_URL: configuration.env.DATABASE_URL,
    TRUSTED_PROXY_CIDRS: trustedProxies,
    RATE_LIMIT_MAX_REQUESTS: "2",
    RATE_LIMIT_WINDOW_MS: "60000",
    LOG_LEVEL: "fatal",
  });
  jest.resetModules();
  jest.unstable_mockModule("@sunshine-erp/config", () => ({ env }));
  const { default: app } = await import("../../app.js");
  // Test-only route on the real app; API rate-limit probes use its existing 404.
  app.get("/__m2_probe", (request, response) => {
    response.json({
      ip: request.ip,
      ips: request.ips,
      socketIp: request.socket.remoteAddress,
      protocol: request.protocol,
      secure: request.secure,
      hostname: request.hostname,
      metadataIp: getActivityRequestMetadata(request).ipAddress,
    });
  });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a local HTTP test server port.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { app, baseUrl };
}

describe("Express trusted proxy boundary", () => {
  it("uses the socket IP when configuration is unset, ignoring forged headers", async () => {
    const { app, baseUrl } = await startApi();
    expect(app.get("trust proxy")).toBe(false);
    const response = await fetch(`${baseUrl}/__m2_probe`, {
      headers: {
        "X-Forwarded-For": "198.51.100.5",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "forged.example",
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      ip: "127.0.0.1", socketIp: "127.0.0.1", ips: [],
      metadataIp: "127.0.0.1", protocol: "http", secure: false,
      hostname: "127.0.0.1",
    });
  });

  it("ignores forwarded IP, protocol, and host from a non-allowlisted socket peer", async () => {
    const { baseUrl } = await startApi("192.0.2.0/24");
    const response = await fetch(`${baseUrl}/__m2_probe`, {
      headers: {
        "X-Forwarded-For": "198.51.100.5, 192.0.2.8",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "forged.example",
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      ip: "127.0.0.1", ips: [], metadataIp: "127.0.0.1",
      protocol: "http", secure: false, hostname: "127.0.0.1",
    });
  });

  it("resolves right-to-left through trusted proxies and stops at the first untrusted IP", async () => {
    const { app, baseUrl } = await startApi("127.0.0.1, 192.0.2.0/24");
    expect(app.get("trust proxy")).toEqual(["127.0.0.1", "192.0.2.0/24"]);
    const response = await fetch(`${baseUrl}/__m2_probe`, {
      headers: {
        "X-Forwarded-For": "203.0.113.99, 198.51.100.5, 192.0.2.8",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "erp.example",
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      ip: "198.51.100.5", ips: ["198.51.100.5", "192.0.2.8"],
      metadataIp: "198.51.100.5", protocol: "https", secure: true,
      hostname: "erp.example",
    });
  });

  it("supports IPv6 proxy CIDRs and IPv4-mapped socket trust", async () => {
    const { baseUrl } = await startApi("::ffff:127.0.0.1, 2001:db8:1::/48");
    const response = await fetch(`${baseUrl}/__m2_probe`, {
      headers: { "X-Forwarded-For": "2001:db8:2::5, 2001:db8:1::8" },
    });
    await expect(response.json()).resolves.toMatchObject({
      ip: "2001:db8:2::5", ips: ["2001:db8:2::5", "2001:db8:1::8"],
      metadataIp: "2001:db8:2::5",
    });
  });

  it("keeps socket identity and HTTP when a trusted peer supplies no forwarded headers", async () => {
    const { baseUrl } = await startApi("127.0.0.1");
    const response = await fetch(`${baseUrl}/__m2_probe`);
    await expect(response.json()).resolves.toMatchObject({
      ip: "127.0.0.1", ips: [], protocol: "http", secure: false,
      hostname: "127.0.0.1", metadataIp: "127.0.0.1",
    });
  });

  it("does not let standard Forwarded override identity or X-Forwarded headers", async () => {
    const { baseUrl } = await startApi("127.0.0.1");
    const forwarded = "for=203.0.113.99;proto=https;host=forged.example";
    const onlyForwarded = await fetch(`${baseUrl}/__m2_probe`, {
      headers: { Forwarded: forwarded },
    });
    await expect(onlyForwarded.json()).resolves.toMatchObject({
      ip: "127.0.0.1", protocol: "http", hostname: "127.0.0.1",
    });
    const both = await fetch(`${baseUrl}/__m2_probe`, {
      headers: { Forwarded: forwarded, "X-Forwarded-For": "198.51.100.5" },
    });
    await expect(both.json()).resolves.toMatchObject({
      ip: "198.51.100.5", metadataIp: "198.51.100.5",
      protocol: "http", hostname: "127.0.0.1",
    });
  });

  it("uses resolved client IPs for distinct rate-limit buckets and ignores spoofed leftmost entries", async () => {
    const { baseUrl } = await startApi("127.0.0.1, 192.0.2.0/24");
    const statuses: number[] = [];
    for (const chain of [
      "203.0.113.1, 198.51.100.5, 192.0.2.8",
      "203.0.113.2, 198.51.100.5, 192.0.2.8",
      "203.0.113.3, 198.51.100.5, 192.0.2.8",
      "198.51.100.6, 192.0.2.8",
    ]) {
      const response = await fetch(`${baseUrl}/api/v1/nonexistent`, {
        headers: { "X-Forwarded-For": chain },
      });
      statuses.push(response.status);
      if (response.status === 429) {
        await expect(response.json()).resolves.toMatchObject({
          error: { code: "RATE_LIMIT_EXCEEDED" },
        });
      } else {
        await response.text();
      }
    }
    expect(statuses).toEqual([404, 404, 429, 404]);
  });

  it("cannot bypass rate limiting by changing forwarded IPs from an untrusted peer", async () => {
    const { baseUrl } = await startApi("192.0.2.0/24");
    const statuses: number[] = [];
    for (const ip of ["198.51.100.5", "198.51.100.6", "198.51.100.7"]) {
      const response = await fetch(`${baseUrl}/api/v1/nonexistent`, {
        headers: { "X-Forwarded-For": ip },
      });
      statuses.push(response.status);
      await response.text();
    }
    expect(statuses).toEqual([404, 404, 429]);
  });
});
