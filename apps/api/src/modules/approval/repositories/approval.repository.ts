import { prisma } from "../../../core/database/prisma.js";
import type { ActivityLogDatabase } from "../../../core/audit/activity-log.repository.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type {
  ApprovalActionRecord,
  ApprovalConfigurationRecord,
  ApprovalDelegationRecord,
  ApprovalHistoryEventType,
  ApprovalHistoryRecord,
  ApprovalLevelRecord,
  ApprovalRequestRecord,
  CreateApprovalConfigurationInput,
  CreateApprovalDelegationInput,
  CreateApprovalLevelInput,
  SubmitApprovalRequestInput,
} from "../types/approval.types.js";

const configurationSelection = {
  id: true,
  organizationId: true,
  configurationCode: true,
  configurationName: true,
  moduleName: true,
  entityName: true,
  approvalRequired: true,
  approvalMode: true,
  submissionStatus: true,
  status: true,
  remarks: true,
  createdById: true,
  createdAt: true,
  updatedById: true,
  updatedAt: true,
} as const;

const levelSelection = {
  id: true,
  approvalConfigurationId: true,
  levelNumber: true,
  levelName: true,
  approverType: true,
  approverUserId: true,
  approverRoleId: true,
  isRequired: true,
  autoApprove: true,
  status: true,
  remarks: true,
  createdById: true,
  createdAt: true,
  updatedById: true,
  updatedAt: true,
} as const;

const requestSelection = {
  id: true,
  organizationId: true,
  approvalConfigurationId: true,
  approvalNumber: true,
  targetModule: true,
  targetEntity: true,
  targetRecordId: true,
  requestedById: true,
  requestedAt: true,
  currentLevelId: true,
  approvalStatus: true,
  submittedAt: true,
  completedAt: true,
  remarks: true,
  createdById: true,
  createdAt: true,
  updatedById: true,
  updatedAt: true,
} as const;

const actionSelection = {
  id: true,
  approvalRequestId: true,
  approvalLevelId: true,
  approverUserId: true,
  actionType: true,
  actionDate: true,
  comments: true,
  rejectionReason: true,
  returnReason: true,
  delegatedToUserId: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedById: true,
  updatedAt: true,
} as const;

const historySelection = {
  id: true,
  approvalRequestId: true,
  approvalLevelId: true,
  approvalActionId: true,
  eventType: true,
  fromStatus: true,
  toStatus: true,
  performedById: true,
  eventAt: true,
  reason: true,
  remarks: true,
  createdById: true,
  createdAt: true,
} as const;

const delegationSelection = {
  id: true,
  organizationId: true,
  delegatorUserId: true,
  delegateUserId: true,
  approvalConfigurationId: true,
  approvalLevelId: true,
  effectiveFrom: true,
  effectiveTo: true,
  reason: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedById: true,
  updatedAt: true,
} as const;

function immutable<TRecord extends object>(record: TRecord): Readonly<TRecord> {
  return Object.freeze({ ...record });
}

export interface ApprovalDecisionContext {
  readonly request: ApprovalRequestRecord;
  readonly configuration: ApprovalConfigurationRecord;
  readonly currentLevel: ApprovalLevelRecord | null;
  readonly activeLevels: readonly ApprovalLevelRecord[];
  readonly approvedLevelIds: readonly string[];
}

export interface PersistApprovalActionInput {
  readonly organizationId: string;
  readonly approvalRequestId: string;
  readonly expectedCurrentLevelId: string;
  readonly approverUserId: string;
  readonly actionType: string;
  readonly actionDate: Date;
  readonly comments?: string;
  readonly rejectionReason?: string;
  readonly returnReason?: string;
  readonly delegatedToUserId?: string;
  readonly createdById?: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly nextLevelId: string | null;
  readonly completedAt: Date | null;
  readonly eventType: ApprovalHistoryEventType;
  readonly reason?: string;
  readonly appendCompletionEvent: boolean;
}

export interface PersistApprovalActionResult {
  readonly action: ApprovalActionRecord;
  readonly request: ApprovalRequestRecord;
  readonly histories: readonly ApprovalHistoryRecord[];
}

export type ApprovalMutationAudit<TResult> = (
  result: TResult,
  database: ActivityLogDatabase,
) => Promise<void>;

export class ApprovalRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async createConfiguration(
    input: CreateApprovalConfigurationInput,
    audit?: ApprovalMutationAudit<ApprovalConfigurationRecord>,
  ): Promise<ApprovalConfigurationRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const organizationExists =
        (await transaction.organization.count({
          where: { id: input.organizationId },
        })) === 1;
      const actorIsValid = input.createdById
        ? (await transaction.user.count({
            where: {
              id: input.createdById,
              organizationId: input.organizationId,
            },
          })) === 1
        : true;
      if (!organizationExists || !actorIsValid) {
        return null;
      }

      const record = await transaction.approvalConfiguration.create({
        data: {
          organizationId: input.organizationId,
          configurationCode: input.configurationCode,
          configurationName: input.configurationName,
          moduleName: input.moduleName,
          entityName: input.entityName,
          approvalRequired: input.approvalRequired,
          approvalMode: input.approvalMode,
          submissionStatus: input.submissionStatus,
          status: input.status,
          remarks: input.remarks,
          createdById: input.createdById,
        },
        select: configurationSelection,
      });
      const result = immutable(record);
      await audit?.(result, transaction);
      return result;
    });
  }

  async findConfiguration(
    id: string,
    organizationId: string,
  ): Promise<ApprovalConfigurationRecord | null> {
    const record = await this.database.approvalConfiguration.findFirst({
      where: { id, organizationId },
      select: configurationSelection,
    });
    return record ? immutable(record) : null;
  }

  async createLevel(
    input: CreateApprovalLevelInput,
    audit?: ApprovalMutationAudit<ApprovalLevelRecord>,
  ): Promise<ApprovalLevelRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const configuration = await transaction.approvalConfiguration.findFirst({
        where: {
          id: input.approvalConfigurationId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      const approverIsValid =
        input.approverType === "User"
          ? (await transaction.user.count({
              where: {
                id: input.approverUserId,
                organizationId: input.organizationId,
              },
            })) === 1
          : (await transaction.role.count({
              where: {
                id: input.approverRoleId,
                organizationId: input.organizationId,
              },
            })) === 1;
      const actorIsValid = input.createdById
        ? (await transaction.user.count({
            where: {
              id: input.createdById,
              organizationId: input.organizationId,
            },
          })) === 1
        : true;
      if (!configuration || !approverIsValid || !actorIsValid) {
        return null;
      }

      const record = await transaction.approvalLevel.create({
        data: {
          approvalConfigurationId: input.approvalConfigurationId,
          levelNumber: input.levelNumber,
          levelName: input.levelName,
          approverType: input.approverType,
          approverUserId: input.approverUserId,
          approverRoleId: input.approverRoleId,
          isRequired: input.isRequired,
          autoApprove: input.autoApprove,
          status: input.status,
          remarks: input.remarks,
          createdById: input.createdById,
        },
        select: levelSelection,
      });
      const result = immutable(record);
      await audit?.(result, transaction);
      return result;
    });
  }

  async listLevels(
    approvalConfigurationId: string,
    organizationId: string,
  ): Promise<readonly ApprovalLevelRecord[]> {
    const records = await this.database.approvalLevel.findMany({
      where: {
        approvalConfigurationId,
        approvalConfiguration: { organizationId },
      },
      orderBy: [{ levelNumber: "asc" }, { id: "asc" }],
      select: levelSelection,
    });
    return Object.freeze(records.map(immutable));
  }

  async submitRequest(
    input: SubmitApprovalRequestInput,
    currentLevelId: string,
    submittedAt: Date,
    audit?: ApprovalMutationAudit<ApprovalRequestRecord>,
  ): Promise<ApprovalRequestRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const configuration = await transaction.approvalConfiguration.findFirst({
        where: {
          id: input.approvalConfigurationId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      const currentLevel = await transaction.approvalLevel.findFirst({
        where: {
          id: currentLevelId,
          approvalConfigurationId: input.approvalConfigurationId,
        },
        select: { id: true },
      });
      const requester = await transaction.user.findFirst({
        where: {
          id: input.requestedById,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      const actorIsValid = input.createdById
        ? (await transaction.user.count({
            where: {
              id: input.createdById,
              organizationId: input.organizationId,
            },
          })) === 1
        : true;
      if (!configuration || !currentLevel || !requester || !actorIsValid) {
        return null;
      }

      const request = await transaction.approvalRequest.create({
        data: {
          organizationId: input.organizationId,
          approvalConfigurationId: input.approvalConfigurationId,
          approvalNumber: input.approvalNumber,
          targetModule: input.targetModule,
          targetEntity: input.targetEntity,
          targetRecordId: input.targetRecordId,
          requestedById: input.requestedById,
          requestedAt: input.requestedAt,
          currentLevelId,
          approvalStatus: "Pending",
          submittedAt,
          remarks: input.remarks,
          createdById: input.createdById,
        },
        select: requestSelection,
      });
      await transaction.approvalHistory.create({
        data: {
          approvalRequestId: request.id,
          approvalLevelId: currentLevelId,
          eventType: "Submitted",
          fromStatus: null,
          toStatus: "Pending",
          performedById: input.requestedById,
          eventAt: submittedAt,
          remarks: input.remarks,
          createdById: input.createdById,
        },
      });
      const result = immutable(request);
      await audit?.(result, transaction);
      return result;
    });
  }

  async findRequest(
    id: string,
    organizationId: string,
  ): Promise<ApprovalRequestRecord | null> {
    const record = await this.database.approvalRequest.findFirst({
      where: { id, organizationId },
      select: requestSelection,
    });
    return record ? immutable(record) : null;
  }

  async getDecisionContext(
    id: string,
    organizationId: string,
  ): Promise<ApprovalDecisionContext | null> {
    const record = await this.database.approvalRequest.findFirst({
      where: { id, organizationId },
      select: {
        ...requestSelection,
        approvalConfiguration: { select: configurationSelection },
        currentLevel: { select: levelSelection },
        actions: {
          where: { actionType: "Approve", status: "Completed" },
          select: { approvalLevelId: true },
        },
      },
    });
    if (!record) {
      return null;
    }
    const activeLevels = await this.database.approvalLevel.findMany({
      where: {
        approvalConfigurationId: record.approvalConfigurationId,
        status: "Active",
      },
      orderBy: [{ levelNumber: "asc" }, { id: "asc" }],
      select: levelSelection,
    });
    const { approvalConfiguration, currentLevel, actions, ...request } = record;
    return Object.freeze({
      request: immutable(request),
      configuration: immutable(approvalConfiguration),
      currentLevel: currentLevel ? immutable(currentLevel) : null,
      activeLevels: Object.freeze(activeLevels.map(immutable)),
      approvedLevelIds: Object.freeze([
        ...new Set(actions.map(({ approvalLevelId }) => approvalLevelId)),
      ]),
    });
  }

  async persistAction(
    input: PersistApprovalActionInput,
    audit?: ApprovalMutationAudit<PersistApprovalActionResult>,
  ): Promise<PersistApprovalActionResult | null> {
    return this.database.$transaction(async (transaction) => {
      const locked = await transaction.approvalRequest.updateMany({
        where: {
          id: input.approvalRequestId,
          organizationId: input.organizationId,
          approvalStatus: input.fromStatus,
          currentLevelId: input.expectedCurrentLevelId,
        },
        data: {
          approvalStatus: input.toStatus,
          currentLevelId: input.nextLevelId,
          completedAt: input.completedAt,
          updatedById: input.createdById ?? input.approverUserId,
        },
      });
      if (locked.count !== 1) {
        return null;
      }

      const action = await transaction.approvalAction.create({
        data: {
          approvalRequestId: input.approvalRequestId,
          approvalLevelId: input.expectedCurrentLevelId,
          approverUserId: input.approverUserId,
          actionType: input.actionType,
          actionDate: input.actionDate,
          comments: input.comments,
          rejectionReason: input.rejectionReason,
          returnReason: input.returnReason,
          delegatedToUserId: input.delegatedToUserId,
          status: "Completed",
          createdById: input.createdById ?? input.approverUserId,
        },
        select: actionSelection,
      });

      const histories: ApprovalHistoryRecord[] = [];
      const actionHistory = await transaction.approvalHistory.create({
        data: {
          approvalRequestId: input.approvalRequestId,
          approvalLevelId: input.expectedCurrentLevelId,
          approvalActionId: action.id,
          eventType: input.eventType,
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          performedById: input.approverUserId,
          eventAt: input.actionDate,
          reason: input.reason,
          remarks: input.comments,
          createdById: input.createdById ?? input.approverUserId,
        },
        select: historySelection,
      });
      histories.push(immutable(actionHistory));

      if (
        input.nextLevelId &&
        input.nextLevelId !== input.expectedCurrentLevelId
      ) {
        const levelStarted = await transaction.approvalHistory.create({
          data: {
            approvalRequestId: input.approvalRequestId,
            approvalLevelId: input.nextLevelId,
            approvalActionId: action.id,
            eventType: "Level Started",
            fromStatus: input.toStatus,
            toStatus: input.toStatus,
            performedById: input.approverUserId,
            eventAt: input.actionDate,
            createdById: input.createdById ?? input.approverUserId,
          },
          select: historySelection,
        });
        histories.push(immutable(levelStarted));
      }

      if (input.appendCompletionEvent) {
        const completion = await transaction.approvalHistory.create({
          data: {
            approvalRequestId: input.approvalRequestId,
            approvalLevelId: input.expectedCurrentLevelId,
            approvalActionId: action.id,
            eventType: "Completed",
            fromStatus: input.fromStatus,
            toStatus: input.toStatus,
            performedById: input.approverUserId,
            eventAt: input.actionDate,
            createdById: input.createdById ?? input.approverUserId,
          },
          select: historySelection,
        });
        histories.push(immutable(completion));
      }

      const request = await transaction.approvalRequest.findUniqueOrThrow({
        where: { id: input.approvalRequestId },
        select: requestSelection,
      });
      const result = Object.freeze({
        action: immutable(action),
        request: immutable(request),
        histories: Object.freeze(histories),
      });
      await audit?.(result, transaction);
      return result;
    });
  }

  async createDelegation(
    input: CreateApprovalDelegationInput,
    audit?: ApprovalMutationAudit<ApprovalDelegationRecord>,
  ): Promise<ApprovalDelegationRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const users = await transaction.user.count({
        where: {
          id: { in: [input.delegatorUserId, input.delegateUserId] },
          organizationId: input.organizationId,
        },
      });
      const actorIsValid = input.createdById
        ? (await transaction.user.count({
            where: {
              id: input.createdById,
              organizationId: input.organizationId,
            },
          })) === 1
        : true;
      const configurationIsValid = input.approvalConfigurationId
        ? (await transaction.approvalConfiguration.count({
            where: {
              id: input.approvalConfigurationId,
              organizationId: input.organizationId,
            },
          })) === 1
        : true;
      const levelIsValid = input.approvalLevelId
        ? (await transaction.approvalLevel.count({
            where: {
              id: input.approvalLevelId,
              approvalConfiguration: {
                organizationId: input.organizationId,
                ...(input.approvalConfigurationId
                  ? { id: input.approvalConfigurationId }
                  : {}),
              },
            },
          })) === 1
        : true;
      if (
        users !== 2 ||
        !actorIsValid ||
        !configurationIsValid ||
        !levelIsValid
      ) {
        return null;
      }

      const record = await transaction.approvalDelegation.create({
        data: {
          organizationId: input.organizationId,
          delegatorUserId: input.delegatorUserId,
          delegateUserId: input.delegateUserId,
          approvalConfigurationId: input.approvalConfigurationId,
          approvalLevelId: input.approvalLevelId,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          reason: input.reason,
          status: input.status,
          createdById: input.createdById,
        },
        select: delegationSelection,
      });
      const result = immutable(record);
      await audit?.(result, transaction);
      return result;
    });
  }

  async findApplicableDelegations(input: {
    readonly organizationId: string;
    readonly delegatorUserId: string;
    readonly delegateUserId: string;
    readonly approvalConfigurationId: string;
    readonly approvalLevelId: string;
    readonly at: Date;
  }): Promise<readonly ApprovalDelegationRecord[]> {
    const records = await this.database.approvalDelegation.findMany({
      where: {
        organizationId: input.organizationId,
        delegatorUserId: input.delegatorUserId,
        delegateUserId: input.delegateUserId,
        status: "Active",
        effectiveFrom: { lte: input.at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.at } }],
        AND: [
          {
            OR: [
              { approvalConfigurationId: null },
              { approvalConfigurationId: input.approvalConfigurationId },
            ],
          },
          {
            OR: [
              { approvalLevelId: null },
              { approvalLevelId: input.approvalLevelId },
            ],
          },
        ],
      },
      orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }],
      select: delegationSelection,
    });
    return Object.freeze(records.map(immutable));
  }

  async listActions(
    approvalRequestId: string,
    organizationId: string,
  ): Promise<readonly ApprovalActionRecord[]> {
    const records = await this.database.approvalAction.findMany({
      where: { approvalRequestId, approvalRequest: { organizationId } },
      orderBy: [{ actionDate: "asc" }, { id: "asc" }],
      select: actionSelection,
    });
    return Object.freeze(records.map(immutable));
  }

  async listHistory(
    approvalRequestId: string,
    organizationId: string,
  ): Promise<readonly ApprovalHistoryRecord[]> {
    const records = await this.database.approvalHistory.findMany({
      where: { approvalRequestId, approvalRequest: { organizationId } },
      orderBy: [{ eventAt: "asc" }, { id: "asc" }],
      select: historySelection,
    });
    return Object.freeze(records.map(immutable));
  }
}

export const approvalRepository = new ApprovalRepository();
