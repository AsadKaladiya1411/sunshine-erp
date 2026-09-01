import {
  AuditService,
  auditService,
} from "../../../core/audit/audit.service.js";
import {
  AuthorizationService,
  authorizationService,
} from "../../authorization/services/authorization.service.js";
import {
  userRoleAssignmentRepository,
  type UserRoleAssignmentRepository,
} from "../../authorization/repositories/user-role-assignment.repository.js";
import {
  ApprovalAuthorizationError,
  ApprovalDelegationAmbiguousError,
  ApprovalNotFoundError,
  ApprovalStateConflictError,
  ApprovalValidationError,
} from "../approval.errors.js";
import {
  ApprovalRepository,
  approvalRepository,
  type ApprovalDecisionContext,
  type PersistApprovalActionResult,
} from "../repositories/approval.repository.js";
import {
  APPROVAL_ACTION_TYPES,
  APPROVAL_CONFIGURATION_STATUSES,
  APPROVAL_DELEGATION_STATUSES,
  APPROVAL_LEVEL_STATUSES,
  APPROVAL_MODES,
  APPROVAL_SUBMISSION_STATUS,
  APPROVER_TYPES,
  type ApprovalActionRecord,
  type ApprovalAuthorizationBoundary,
  type ApprovalConfigurationRecord,
  type ApprovalDelegationRecord,
  type ApprovalHistoryEventType,
  type ApprovalHistoryRecord,
  type ApprovalLevelRecord,
  type ApprovalRequestRecord,
  type CreateApprovalConfigurationInput,
  type CreateApprovalDelegationInput,
  type CreateApprovalLevelInput,
  type RecordApprovalActionInput,
  type SubmitApprovalRequestInput,
} from "../types/approval.types.js";

const APPROVAL_ACTIVITY_ACTIONS = Object.freeze({
  configurationCreated: "ApprovalConfigurationCreated",
  levelCreated: "ApprovalLevelCreated",
  requestSubmitted: "ApprovalRequestSubmitted",
  actionRecorded: "ApprovalActionRecorded",
  delegationCreated: "ApprovalDelegationCreated",
});

function includes<TValue extends string>(
  values: readonly TValue[],
  value: string,
): value is TValue {
  return values.includes(value as TValue);
}

function assertText(value: string, label: string, maxLength: number): void {
  if (value.trim().length === 0 || value.length > maxLength) {
    throw new ApprovalValidationError(
      `${label} must contain 1 to ${maxLength} characters.`,
    );
  }
}

function assertOptionalText(
  value: string | undefined,
  label: string,
  maxLength?: number,
): void {
  if (value === undefined) {
    return;
  }
  if (value.trim().length === 0 || (maxLength && value.length > maxLength)) {
    throw new ApprovalValidationError(
      maxLength
        ? `${label} must contain 1 to ${maxLength} characters.`
        : `${label} must not be blank.`,
    );
  }
}

export class RbacApprovalAuthorizationBoundary implements ApprovalAuthorizationBoundary {
  constructor(
    private readonly permissionCode: string,
    private readonly authorization: AuthorizationService = authorizationService,
    private readonly roleAssignments: UserRoleAssignmentRepository = userRoleAssignmentRepository,
  ) {
    if (permissionCode.trim().length === 0) {
      throw new ApprovalValidationError(
        "An approved RBAC permission code is required.",
      );
    }
  }

  canPerformApproval(userId: string, organizationId: string): Promise<boolean> {
    return this.authorization.hasPermission(
      userId,
      organizationId,
      this.permissionCode,
    );
  }

  async hasActiveRole(
    userId: string,
    organizationId: string,
    roleId: string,
  ): Promise<boolean> {
    const assignments = await this.roleAssignments.findActiveAssignments(
      userId,
      organizationId,
    );
    return assignments.some((assignment) => assignment.roleId === roleId);
  }
}

export interface ApprovalActionResult {
  readonly action: ApprovalActionRecord;
  readonly request: ApprovalRequestRecord;
  readonly histories: readonly ApprovalHistoryRecord[];
}

export class ApprovalService {
  constructor(
    private readonly authorization: ApprovalAuthorizationBoundary,
    private readonly repository: ApprovalRepository = approvalRepository,
    private readonly audit: AuditService = auditService,
  ) {}

  async createConfiguration(
    input: CreateApprovalConfigurationInput,
  ): Promise<ApprovalConfigurationRecord> {
    assertText(input.configurationCode, "Configuration code", 50);
    assertText(input.configurationName, "Configuration name", 150);
    assertText(input.moduleName, "Module name", 100);
    assertText(input.entityName, "Entity name", 100);
    assertOptionalText(input.remarks, "Remarks");
    if (!includes(APPROVAL_MODES, input.approvalMode)) {
      throw new ApprovalValidationError("Unsupported approval mode.");
    }
    if (input.submissionStatus !== APPROVAL_SUBMISSION_STATUS) {
      throw new ApprovalValidationError("Unsupported submission status.");
    }
    if (!includes(APPROVAL_CONFIGURATION_STATUSES, input.status)) {
      throw new ApprovalValidationError("Unsupported configuration status.");
    }

    const record = await this.repository.createConfiguration(
      input,
      input.createdById
        ? async (created, database) => {
            await this.audit.recordActivity(
              {
                userId: input.createdById!,
                organizationId: input.organizationId,
                module: "Approval Workflow",
                entityName: "ApprovalConfiguration",
                recordId: created.id,
                action: APPROVAL_ACTIVITY_ACTIONS.configurationCreated,
                remarks: "Approval configuration created.",
              },
              database,
            );
          }
        : undefined,
    );
    if (!record) {
      throw new ApprovalNotFoundError(
        "Organization or audit actor was not found in the requested tenant.",
      );
    }
    return record;
  }

  async createLevel(
    input: CreateApprovalLevelInput,
  ): Promise<ApprovalLevelRecord> {
    if (!Number.isInteger(input.levelNumber) || input.levelNumber <= 0) {
      throw new ApprovalValidationError(
        "Level number must be a positive integer.",
      );
    }
    assertText(input.levelName, "Level name", 100);
    assertOptionalText(input.remarks, "Remarks");
    if (!includes(APPROVER_TYPES, input.approverType)) {
      throw new ApprovalValidationError("Unsupported approver type.");
    }
    if (!includes(APPROVAL_LEVEL_STATUSES, input.status)) {
      throw new ApprovalValidationError("Unsupported approval level status.");
    }
    const hasUser = input.approverUserId !== undefined;
    const hasRole = input.approverRoleId !== undefined;
    if (
      (input.approverType === "User" && (!hasUser || hasRole)) ||
      (input.approverType === "Role" && (!hasRole || hasUser))
    ) {
      throw new ApprovalValidationError(
        "Exactly one approver source must match the approver type.",
      );
    }

    const record = await this.repository.createLevel(
      input,
      input.createdById
        ? async (created, database) => {
            await this.audit.recordActivity(
              {
                userId: input.createdById!,
                organizationId: input.organizationId,
                module: "Approval Workflow",
                entityName: "ApprovalLevel",
                recordId: created.id,
                action: APPROVAL_ACTIVITY_ACTIONS.levelCreated,
                remarks: "Approval level created.",
              },
              database,
            );
          }
        : undefined,
    );
    if (!record) {
      throw new ApprovalNotFoundError(
        "Configuration, approver, role, or audit actor was not found in the requested tenant.",
      );
    }
    return record;
  }

  async isApprovalRequired(
    approvalConfigurationId: string,
    organizationId: string,
  ): Promise<boolean> {
    const configuration = await this.repository.findConfiguration(
      approvalConfigurationId,
      organizationId,
    );
    if (!configuration) {
      throw new ApprovalNotFoundError("Approval configuration was not found.");
    }
    return configuration.status === "Active" && configuration.approvalRequired;
  }

  async submitRequest(
    input: SubmitApprovalRequestInput,
  ): Promise<ApprovalRequestRecord> {
    assertText(input.approvalNumber, "Approval number", 50);
    assertText(input.targetModule, "Target module", 100);
    assertText(input.targetEntity, "Target entity", 100);
    assertOptionalText(input.remarks, "Remarks");

    const configuration = await this.repository.findConfiguration(
      input.approvalConfigurationId,
      input.organizationId,
    );
    if (!configuration) {
      throw new ApprovalNotFoundError("Approval configuration was not found.");
    }
    if (configuration.status !== "Active") {
      throw new ApprovalStateConflictError(
        "Inactive approval configuration cannot accept requests.",
      );
    }
    if (!configuration.approvalRequired) {
      throw new ApprovalStateConflictError(
        "This configuration does not require an Approval Request.",
      );
    }
    if (
      configuration.moduleName !== input.targetModule ||
      configuration.entityName !== input.targetEntity
    ) {
      throw new ApprovalValidationError(
        "Target module and entity must match the Approval Configuration.",
      );
    }

    const levels = (
      await this.repository.listLevels(
        input.approvalConfigurationId,
        input.organizationId,
      )
    ).filter((level) => level.status === "Active");
    const firstLevel = levels[0];
    if (!firstLevel) {
      throw new ApprovalStateConflictError(
        "Approval configuration has no active levels.",
      );
    }
    if (configuration.approvalMode === "Single" && levels.length !== 1) {
      throw new ApprovalStateConflictError(
        "Single approval mode requires exactly one active level.",
      );
    }

    const submittedAt = input.submittedAt ?? new Date();
    const record = await this.repository.submitRequest(
      input,
      firstLevel.id,
      submittedAt,
      async (submitted, database) => {
        await this.audit.recordActivity(
          {
            userId: input.createdById ?? input.requestedById,
            organizationId: input.organizationId,
            module: "Approval Workflow",
            entityName: "ApprovalRequest",
            recordId: submitted.id,
            action: APPROVAL_ACTIVITY_ACTIONS.requestSubmitted,
            performedAt: submittedAt,
            remarks: "Approval request submitted.",
          },
          database,
        );
      },
    );
    if (!record) {
      throw new ApprovalNotFoundError(
        "Requester, configuration, level, or audit actor was not found in the requested tenant.",
      );
    }
    return record;
  }

  async recordAction(
    input: RecordApprovalActionInput,
  ): Promise<ApprovalActionResult> {
    if (!includes(APPROVAL_ACTION_TYPES, input.actionType)) {
      throw new ApprovalValidationError("Unsupported approval action.");
    }
    assertOptionalText(input.comments, "Comments");
    assertOptionalText(input.rejectionReason, "Rejection reason");
    assertOptionalText(input.returnReason, "Return reason");
    if (input.actionType === "Reject" && !input.rejectionReason) {
      throw new ApprovalValidationError(
        "Rejection reason is required for Reject.",
      );
    }
    if (input.actionType === "Return" && !input.returnReason) {
      throw new ApprovalValidationError(
        "Return reason is required for Return.",
      );
    }
    if (input.actionType === "Delegate" && !input.delegatedToUserId) {
      throw new ApprovalValidationError(
        "Delegated user is required for Delegate.",
      );
    }
    if (
      input.actionType === "Delegate" &&
      input.delegatedToUserId === input.approverUserId
    ) {
      throw new ApprovalValidationError("An approver cannot delegate to self.");
    }

    const context = await this.repository.getDecisionContext(
      input.approvalRequestId,
      input.organizationId,
    );
    if (!context) {
      throw new ApprovalNotFoundError("Approval request was not found.");
    }
    if (context.request.approvalStatus !== "Pending" || !context.currentLevel) {
      throw new ApprovalStateConflictError(
        "Only a pending Approval Request with a current level accepts actions.",
      );
    }
    if (
      !(await this.authorization.canPerformApproval(
        input.approverUserId,
        input.organizationId,
      ))
    ) {
      throw new ApprovalAuthorizationError();
    }
    if (
      input.delegatedToUserId &&
      !(await this.authorization.canPerformApproval(
        input.delegatedToUserId,
        input.organizationId,
      ))
    ) {
      throw new ApprovalAuthorizationError(
        "Delegated user is not authorized for approval operations.",
      );
    }
    const actionDate = input.actionDate ?? new Date();
    await this.assertApproverEligibility(context, input, actionDate);
    if (
      input.actionType === "Approve" &&
      context.configuration.approvalMode === "Single" &&
      context.request.requestedById === input.approverUserId
    ) {
      throw new ApprovalAuthorizationError(
        "Creator cannot approve their own submission.",
      );
    }

    const transition = this.resolveTransition(context, input.actionType);
    const result = await this.repository.persistAction(
      {
        organizationId: input.organizationId,
        approvalRequestId: input.approvalRequestId,
        expectedCurrentLevelId: context.currentLevel.id,
        approverUserId: input.approverUserId,
        actionType: input.actionType,
        actionDate,
        comments: input.comments,
        rejectionReason: input.rejectionReason,
        returnReason: input.returnReason,
        delegatedToUserId: input.delegatedToUserId,
        createdById: input.createdById,
        fromStatus: context.request.approvalStatus,
        toStatus: transition.toStatus,
        nextLevelId: transition.nextLevelId,
        completedAt: transition.completedAt ? actionDate : null,
        eventType: transition.eventType,
        reason: input.rejectionReason ?? input.returnReason,
        appendCompletionEvent: transition.appendCompletionEvent,
      },
      async (persisted, database) => {
        await this.audit.recordActivity(
          {
            userId: input.approverUserId,
            organizationId: input.organizationId,
            module: "Approval Workflow",
            entityName: "ApprovalAction",
            recordId: persisted.action.id,
            action: APPROVAL_ACTIVITY_ACTIONS.actionRecorded,
            performedAt: actionDate,
            remarks: `Approval action recorded: ${input.actionType}.`,
          },
          database,
        );
      },
    );
    if (!result) {
      throw new ApprovalStateConflictError(
        "Approval Request changed before the action could be recorded.",
      );
    }
    return this.freezeActionResult(result);
  }

  async createDelegation(
    input: CreateApprovalDelegationInput,
  ): Promise<ApprovalDelegationRecord> {
    if (!includes(APPROVAL_DELEGATION_STATUSES, input.status)) {
      throw new ApprovalValidationError("Unsupported delegation status.");
    }
    assertOptionalText(input.reason, "Reason");
    if (input.delegatorUserId === input.delegateUserId) {
      throw new ApprovalValidationError(
        "Delegator and delegate must be different users.",
      );
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new ApprovalValidationError(
        "Delegation effective_to cannot precede effective_from.",
      );
    }
    for (const userId of [input.delegatorUserId, input.delegateUserId]) {
      if (
        !(await this.authorization.canPerformApproval(
          userId,
          input.organizationId,
        ))
      ) {
        throw new ApprovalAuthorizationError(
          "Delegator and delegate must both be authorized for approval operations.",
        );
      }
    }

    const record = await this.repository.createDelegation(
      input,
      async (created, database) => {
        await this.audit.recordActivity(
          {
            userId: input.createdById ?? input.delegatorUserId,
            organizationId: input.organizationId,
            module: "Approval Workflow",
            entityName: "ApprovalDelegation",
            recordId: created.id,
            action: APPROVAL_ACTIVITY_ACTIONS.delegationCreated,
            remarks: "Approval delegation created.",
          },
          database,
        );
      },
    );
    if (!record) {
      throw new ApprovalNotFoundError(
        "Delegation user, scope, or audit actor was not found in the requested tenant.",
      );
    }
    return record;
  }

  listActions(
    approvalRequestId: string,
    organizationId: string,
  ): Promise<readonly ApprovalActionRecord[]> {
    return this.repository.listActions(approvalRequestId, organizationId);
  }

  listHistory(
    approvalRequestId: string,
    organizationId: string,
  ): Promise<readonly ApprovalHistoryRecord[]> {
    return this.repository.listHistory(approvalRequestId, organizationId);
  }

  private async assertApproverEligibility(
    context: ApprovalDecisionContext,
    input: RecordApprovalActionInput,
    actionDate: Date,
  ): Promise<void> {
    const level = context.currentLevel;
    if (!level) {
      throw new ApprovalStateConflictError("Approval level is unavailable.");
    }

    if (level.approverType === "User") {
      if (level.approverUserId === input.approverUserId) {
        return;
      }
      if (
        !level.approverUserId ||
        input.delegatedFromUserId !== level.approverUserId
      ) {
        throw new ApprovalAuthorizationError(
          "User is not the configured approver or an approved delegate.",
        );
      }
      await this.assertSingleApplicableDelegation(
        context,
        level.approverUserId,
        input.approverUserId,
        actionDate,
      );
      return;
    }

    if (!level.approverRoleId) {
      throw new ApprovalStateConflictError("Role approval level has no Role.");
    }
    if (
      await this.authorization.hasActiveRole(
        input.approverUserId,
        input.organizationId,
        level.approverRoleId,
      )
    ) {
      return;
    }
    if (!input.delegatedFromUserId) {
      throw new ApprovalAuthorizationError(
        "User does not hold the configured approver Role.",
      );
    }
    const delegatorHasRole = await this.authorization.hasActiveRole(
      input.delegatedFromUserId,
      input.organizationId,
      level.approverRoleId,
    );
    if (!delegatorHasRole) {
      throw new ApprovalAuthorizationError(
        "Delegator does not hold the configured approver Role.",
      );
    }
    await this.assertSingleApplicableDelegation(
      context,
      input.delegatedFromUserId,
      input.approverUserId,
      actionDate,
    );
  }

  private async assertSingleApplicableDelegation(
    context: ApprovalDecisionContext,
    delegatorUserId: string,
    delegateUserId: string,
    at: Date,
  ): Promise<void> {
    if (!context.currentLevel) {
      throw new ApprovalStateConflictError("Approval level is unavailable.");
    }
    const delegations = await this.repository.findApplicableDelegations({
      organizationId: context.request.organizationId,
      delegatorUserId,
      delegateUserId,
      approvalConfigurationId: context.configuration.id,
      approvalLevelId: context.currentLevel.id,
      at,
    });
    if (delegations.length === 0) {
      throw new ApprovalAuthorizationError(
        "No active delegation authorizes this approver.",
      );
    }
    if (delegations.length > 1) {
      throw new ApprovalDelegationAmbiguousError();
    }
  }

  private resolveTransition(
    context: ApprovalDecisionContext,
    actionType: string,
  ): {
    readonly toStatus: string;
    readonly nextLevelId: string | null;
    readonly completedAt: boolean;
    readonly eventType: ApprovalHistoryEventType;
    readonly appendCompletionEvent: boolean;
  } {
    if (actionType === "Reject") {
      return {
        toStatus: "Rejected",
        nextLevelId: null,
        completedAt: true,
        eventType: "Rejected",
        appendCompletionEvent: false,
      };
    }
    if (actionType === "Return") {
      return {
        toStatus: "Returned",
        nextLevelId: null,
        completedAt: true,
        eventType: "Returned",
        appendCompletionEvent: false,
      };
    }
    if (actionType === "Delegate") {
      return {
        toStatus: "Pending",
        nextLevelId: context.currentLevel?.id ?? null,
        completedAt: false,
        eventType: "Delegated",
        appendCompletionEvent: false,
      };
    }

    const approved = new Set(context.approvedLevelIds);
    if (context.currentLevel) {
      approved.add(context.currentLevel.id);
    }
    const nextRequiredLevel = context.activeLevels.find(
      (level) => level.isRequired && !approved.has(level.id),
    );
    if (nextRequiredLevel) {
      return {
        toStatus: "Pending",
        nextLevelId: nextRequiredLevel.id,
        completedAt: false,
        eventType: "Approved",
        appendCompletionEvent: false,
      };
    }
    return {
      toStatus: "Approved",
      nextLevelId: null,
      completedAt: true,
      eventType: "Approved",
      appendCompletionEvent: true,
    };
  }

  private freezeActionResult(
    result: PersistApprovalActionResult,
  ): ApprovalActionResult {
    return Object.freeze({
      action: result.action,
      request: result.request,
      histories: result.histories,
    });
  }
}
