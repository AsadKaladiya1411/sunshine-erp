import { env } from "@sunshine-erp/config";
import type { CookieOptions, Request, Response } from "express";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.REFRESH_COOKIE_SECURE,
  sameSite: env.REFRESH_COOKIE_SAME_SITE,
  path: env.REFRESH_COOKIE_PATH,
};

export function readRefreshTokenCookie(request: Request): string | undefined {
  const cookieHeader = request.get("Cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (const cookiePair of cookieHeader.split(";")) {
    const separatorIndex = cookiePair.indexOf("=");

    if (separatorIndex < 0) {
      continue;
    }

    const name = cookiePair.slice(0, separatorIndex).trim();

    if (name !== env.REFRESH_COOKIE_NAME) {
      continue;
    }

    const value = cookiePair.slice(separatorIndex + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function setRefreshTokenCookie(
  response: Response,
  refreshToken: string,
): void {
  response.cookie(env.REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions,
    maxAge: env.REFRESH_TOKEN_LIFETIME_SECONDS * 1_000,
  });
}

export function clearRefreshTokenCookie(response: Response): void {
  response.clearCookie(env.REFRESH_COOKIE_NAME, cookieOptions);
}
