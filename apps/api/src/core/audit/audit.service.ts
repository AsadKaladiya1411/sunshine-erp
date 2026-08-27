import { AuthenticationError } from "../http/errors.js";
import { isAuthenticatedRequestContext } from "../http/request-context.js";
import {
  activityLogRepository,
  type ActivityLogRepository,
} from "./activity-log.repository.js";
import type {
  ActivityLogRecord,
  RecordActivityInput,
  RecordAuthenticatedActivityInput,
} from "./activity-log.types.js";

const allowedInputKeys = new Set([
  "userId",
  "organizationId",
  "module",
  "entityName",
  "recordId",
  "action",
  "ipAddress",
  "userAgent",
  "deviceInfo",
  "performedAt",
  "remarks",
]);

const credentialAssignmentPattern =
  /\b(?:password(?:_hash)?|access[_ -]?token|refresh[_ -]?token|reset[_ -]?token|authorization|cookie|api[_ -]?key|client[_ -]?secret|secret)\s*[:=]/i;
const bearerPattern = /\bBearer\s+\S+/i;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;

function assertSafeText(label: string, value: string | undefined): void {
  if (
    value &&
    (credentialAssignmentPattern.test(value) ||
      bearerPattern.test(value) ||
      jwtPattern.test(value))
  ) {
    throw new Error("Sensitive credential data is not allowed in " + label + ".");
  }
}

function assertSafeInput(input: RecordActivityInput): void {
  for (const key of Object.keys(input)) {
    if (!allowedInputKeys.has(key)) {
      throw new Error("Unsupported Activity Log field: " + key + ".");
    }
  }

  assertSafeText("module", input.module);
  assertSafeText("entityName", input.entityName);
  assertSafeText("recordId", input.recordId);
  assertSafeText("action", input.action);
  assertSafeText("userAgent", input.userAgent);
  assertSafeText("remarks", input.remarks);
  assertSafeText("deviceInfo.platform", input.deviceInfo?.platform);
}

export class AuditService {
  constructor(
    private readonly repository: ActivityLogRepository = activityLogRepository,
  ) {}

  async recordActivity(input: RecordActivityInput): Promise<ActivityLogRecord> {
    assertSafeInput(input);
    return this.repository.append(Object.freeze({ ...input }));
  }

  recordAuthenticatedActivity(
    input: RecordAuthenticatedActivityInput,
  ): Promise<ActivityLogRecord> {
    if (!isAuthenticatedRequestContext(input.context)) {
      throw new AuthenticationError();
    }

    return this.recordActivity({
      userId: input.context.userId,
      organizationId: input.context.organizationId,
      module: input.module,
      entityName: input.entityName,
      recordId: input.recordId,
      action: input.action,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      deviceInfo: input.deviceInfo,
      performedAt: input.performedAt,
      remarks: input.remarks,
    });
  }
}

export const auditService = new AuditService();
