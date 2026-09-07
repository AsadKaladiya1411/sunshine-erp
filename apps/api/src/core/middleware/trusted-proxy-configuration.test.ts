import { describe, expect, it } from "@jest/globals";
import { parseEnvironment } from "@sunshine-erp/config";
import express from "express";

const fixture = {
  DATABASE_URL: "postgresql://localhost:5432/sunshine_erp_test",
  JWT_SECRET: "test-only-proxy-jwt-secret-at-least-32-characters",
  REFRESH_TOKEN_DIGEST_SECRET:
    "test-only-proxy-refresh-secret-at-least-32-characters",
  REFRESH_COOKIE_SECURE: "true",
};

describe("trusted proxy configuration", () => {
  it.each(["development", "test", "production"])(
    "does not infer proxy trust in %s",
    (environment) => {
      expect(
        parseEnvironment({ ...fixture, NODE_ENV: environment })
          .TRUSTED_PROXY_CIDRS,
      ).toEqual([]);
    },
  );

  it.each(["", "   "])("accepts disabled configuration %j", (value) => {
    expect(
      parseEnvironment({ ...fixture, TRUSTED_PROXY_CIDRS: value })
        .TRUSTED_PROXY_CIDRS,
    ).toEqual([]);
  });

  it.each([
    "127.0.0.1",
    "192.0.2.5/32",
    "192.0.2.0/24",
    "::1",
    "2001:db8::5/128",
    "2001:db8:1234::/48",
    "::ffff:192.0.2.5",
    "::ffff:192.0.2.0/120",
  ])("accepts and compiles explicit address %s", (value) => {
    const configuration = parseEnvironment({
      ...fixture,
      TRUSTED_PROXY_CIDRS: value,
    });
    expect(configuration.TRUSTED_PROXY_CIDRS).toEqual([value]);
    expect(() =>
      express().set("trust proxy", configuration.TRUSTED_PROXY_CIDRS),
    ).not.toThrow();
  });

  it("trims a mixed explicit allowlist without adding implicit trust", () => {
    expect(
      parseEnvironment({
        ...fixture,
        TRUSTED_PROXY_CIDRS: " 192.0.2.5 , 2001:db8::/64 ",
      }).TRUSTED_PROXY_CIDRS,
    ).toEqual(["192.0.2.5", "2001:db8::/64"]);
  });

  it.each([
    "0.0.0.0/1,128.0.0.0/1",
    "::ffff:0:0/97,::ffff:128.0.0.0/97",
  ])("rejects aggregate unrestricted IPv4 coverage %j", (value) => {
    expect(() =>
      parseEnvironment({ ...fixture, TRUSTED_PROXY_CIDRS: value }),
    ).toThrow("must not collectively trust the entire IPv4 address space");
  });

  it("rejects aggregate unrestricted IPv6 coverage", () => {
    expect(() =>
      parseEnvironment({
        ...fixture,
        TRUSTED_PROXY_CIDRS: "::/1,8000::/1",
      }),
    ).toThrow("must not collectively trust the entire IPv6 address space");
  });

  it.each([
    "0.0.0.0/2,64.0.0.0/2",
    "2001:db8::/33,2001:db8:8000::/33",
    "::ffff:0:0/98,::ffff:64.0.0.0/98",
  ])("accepts aggregate partial coverage %j", (value) => {
    expect(
      parseEnvironment({ ...fixture, TRUSTED_PROXY_CIDRS: value })
        .TRUSTED_PROXY_CIDRS,
    ).toEqual(value.split(","));
  });

  it.each([
    "true", "false", "*", "1", "2", "loopback", "uniquelocal", "linklocal",
    "0.0.0.0/0", "::/0", "192.0.2.5/0", "localhost", "proxy.example",
    "::ffff:0:0/96", "::ffff:192.0.2.0/96", "::/1",
    "http://192.0.2.5", "192.0.2.5:8080", "[::1]:8080", "[::1]",
    "256.0.0.1", "127.1", "::gg", "fe80::1%eth0", "192.0.2.0/33",
    "2001:db8::/129", "192.0.2.5/", "192.0.2.5/-1", "192.0.2.5/1.5",
    "192.0.2.5/24/1", "192.0.2.5/255.255.255.0", "192.0.2.5,", ",::1",
    "192.0.2.5,,::1", "192.0.2.5,*",
  ])("rejects invalid or unrestricted trust %j", (value) => {
    expect(() =>
      parseEnvironment({ ...fixture, TRUSTED_PROXY_CIDRS: value }),
    ).toThrow(expect.objectContaining({
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: expect.arrayContaining(["TRUSTED_PROXY_CIDRS"]),
        }),
      ]),
    }));
  });
});
