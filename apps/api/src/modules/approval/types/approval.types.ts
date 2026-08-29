export const APPROVAL_MODES = ["Single", "Multi Level"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const APPROVAL_CONFIGURATION_STATUSES = ["Active", "Inactive"] as const;
export type ApprovalConfigurationStatus =
  (typeof APPROVAL_CONFIGURATION_STATUSES)[number];

export const APPROVAL_SUBMISSION_STATUS = "Configured" as const;

export const APPROVER_TYPES = ["User", "Role"] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];

export const APPROVAL_LEVEL_STATUSES = ["Active", "Inactive"] as const;
export type ApprovalLevelStatus = (typeof APPROVAL_LEVEL_STATUSES)[number];

export const APPROVAL_REQUEST_STATUSES = [
  "Pending",
  "Approved",
  "Rejected",
  "Returned",
  "Cancelled",
] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

export const APPROVAL_ACTION_TYPES = [
  "Approve",
  "Reject",
  "Return",
  "Delegate",
] as const;
export type ApprovalActionType = (typeof APPROVAL_ACTION_TYPES)[number];

export const APPROVAL_ACTION_STATUSES = ["Completed", "Cancelled"] as const;
export type ApprovalActionStatus = (typeof APPROVAL_ACTION_STATUSES)[number];

export const APPROVAL_HISTORY_EVENT_TYPES = [
  "Submitted",
  "Level Started",
  "Approved",
  "Rejected",
  "Returned",
  "Delegated",
  "Completed",
  "Cancelled",
] as const;
export type ApprovalHistoryEventType =
  (typeof APPROVAL_HISTORY_EVENT_TYPES)[number];

export const APPROVAL_DELEGATION_STATUSES = [
  "Active",
  "Expired",
  "Cancelled",
] as const;
export type ApprovalDelegationStatus =
  (typeof APPROVAL_DELEGATION_STATUSES)[number];

export interface ApprovalConfigurationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly configurationCode: string;
  readonly configurationName: string;
  readonly moduleName: string;
  readonly entityName: string;
  readonly approvalRequired: boolean;
  readonly approvalMode: string;
  readonly submissionStatus: string;
  readonly status: string;
  readonly remarks: string | null;
  readonly createdById: string | null;
  readonly createdAt: Date;
  readonly updatedById: string | null;
  readonly updatedAt: Date;
}

export interface ApprovalLevelRecord {
  readonly id: string;
  readonly approvalConfigurationId: string;
  readonly levelNumber: number;
  readonly levelName: string;
  readonly approverType: string;
  readonly approverUserId: string | null;
  readonly approverRoleId: string | null;
  readonly isRequired: boolean;
  readonly autoApprove: boolean;
  readonly status: string;
  readonly remarks: string | null;
  readonly createdById: string | null;
  readonly createdAt: Date;
  readonly updatedById: string | null;
  readonly updatedAt: Date;
}

export interface ApprovalRequestRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly approvalConfigurationId: string;
  readonly approvalNumber: string;
  readonly targetModule: string;
  readonly targetEntity: string;
  readonly targetRecordId: string;
  readonly requestedById: string;
  readonly requestedAt: Date;
  readonly currentLevelId: string | null;
  readonly approvalStatus: string;
  readonly submittedAt: Date | null;
  readonly completedAt: Date | null;
  readonly remarks: string | null;
  readonly createdById: string | null;
  readonly createdAt: Date;
  readonly updatedById: string | null;
  readonly updatedAt: Date;
}

export interface ApprovalActionRecord {
  readonly id: string;
  readonly approvalRequestId: string;
  readonly approvalLevelId: string;
  readonly approverUserId: string;
  readonly actionType: string;
  readonly actionDate: Date;
  readonly comments: string | null;
  readonly rejectionReason: string | null;
  readonly returnReason: string | null;
  readonly delegatedToUserId: string | null;
  readonly status: string;
  readonly createdById: string | null;
  readonly createdAt: Date;
  readonly updatedById: string | null;
  readonly updatedAt: Date;
}

export interface ApprovalHistoryRecord {
  readonly id: string;
  readonly approvalRequestId: string;
  readonly approvalLevelId: string | null;
  readonly approvalActionId: string | null;
  readonly eventType: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly performedById: string | null;
  readonly eventAt: Date;
  readonly reason: string | null;
  readonly remarks: string | null;
  readonly createdById: string | null;
  readonly createdAt: Date;
}

export interface ApprovalDelegationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly delegatorUserId: string;
  readonly delegateUserId: string;
  readonly approvalConfigurationId: string | null;
  readonly approvalLevelId: string | null;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly reason: string | null;
  readonly status: string;
  readonly createdById: string | null;
  readonly createdAt: Date;
  readonly updatedById: string | null;
  readonly updatedAt: Date;
}

export interface CreateApprovalConfigurationInput {
  readonly organizationId: string;
  readonly configurationCode: string;
  readonly configurationName: string;
  readonly moduleName: string;
  readonly entityName: string;
  readonly approvalRequired?: boolean;
  readonly approvalMode: ApprovalMode;
  readonly submissionStatus: typeof APPROVAL_SUBMISSION_STATUS;
  readonly status: ApprovalConfigurationStatus;
  readonly remarks?: string;
  readonly createdById?: string;
}

export interface CreateApprovalLevelInput {
  readonly organizationId: string;
  readonly approvalConfigurationId: string;
  readonly levelNumber: number;
  readonly levelName: string;
  readonly approverType: ApproverType;
  readonly approverUserId?: string;
  readonly approverRoleId?: string;
  readonly isRequired?: boolean;
  readonly autoApprove?: boolean;
  readonly status: ApprovalLevelStatus;
  readonly remarks?: string;
  readonly createdById?: string;
}

export interface SubmitApprovalRequestInput {
  readonly organizationId: string;
  readonly approvalConfigurationId: string;
  readonly approvalNumber: string;
  readonly targetModule: string;
  readonly targetEntity: string;
  readonly targetRecordId: string;
  readonly requestedById: string;
  readonly requestedAt?: Date;
  readonly submittedAt?: Date;
  readonly remarks?: string;
  readonly createdById?: string;
}

export interface RecordApprovalActionInput {
  readonly organizationId: string;
  readonly approvalRequestId: string;
  readonly approverUserId: string;
  readonly actionType: ApprovalActionType;
  readonly actionDate?: Date;
  readonly comments?: string;
  readonly rejectionReason?: string;
  readonly returnReason?: string;
  readonly delegatedToUserId?: string;
  readonly delegatedFromUserId?: string;
  readonly createdById?: string;
}

export interface CreateApprovalDelegationInput {
  readonly organizationId: string;
  readonly delegatorUserId: string;
  readonly delegateUserId: string;
  readonly approvalConfigurationId?: string;
  readonly approvalLevelId?: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date;
  readonly reason?: string;
  readonly status: ApprovalDelegationStatus;
  readonly createdById?: string;
}

export interface ApprovalAuthorizationBoundary {
  canPerformApproval(
    userId: string,
    organizationId: string,
  ): Promise<boolean>;
  hasActiveRole(
    userId: string,
    organizationId: string,
    roleId: string,
  ): Promise<boolean>;
}
