import type { Request } from "express";
import type { ActivityRequestMetadata } from "./activity-log.types.js";

function unquoteClientHint(value: string | undefined): string | undefined {
  return value?.replace(/^"|"$/g, "");
}

export function getActivityRequestMetadata(
  request: Request,
): ActivityRequestMetadata {
  const platform = unquoteClientHint(request.get("Sec-CH-UA-Platform"));
  const mobileHeader = request.get("Sec-CH-UA-Mobile");
  const mobile =
    mobileHeader === "?1" ? true : mobileHeader === "?0" ? false : undefined;
  const deviceInfo =
    platform === undefined && mobile === undefined
      ? undefined
      : Object.freeze({ platform, mobile });

  return Object.freeze({
    ipAddress: request.ip,
    userAgent: request.get("User-Agent"),
    deviceInfo,
  });
}
