export enum UserRole {
  Parent = "parent",
  Child = "child"
}

export enum MissionStatus {
  Scheduled = "scheduled",
  Notified = "notified",
  Snoozed = "snoozed",
  ProofPending = "proof_pending",
  ParentReview = "parent_review",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled"
}

export enum ChatActionDraftStatus {
  Drafted = "drafted",
  Confirmed = "confirmed",
  Rejected = "rejected",
  Expired = "expired",
  Invalid = "invalid"
}

export enum ChatActionType {
  CreateMissionTemplate = "create_mission_template",
  UpdateMissionTemplate = "update_mission_template",
  DeleteMissionTemplate = "delete_mission_template",
  RequestSnooze = "request_snooze"
}

export enum ProofRuleType {
  TapDone = "tap_done",
  GeofenceExit = "geofence_exit",
  Photo = "photo",
  ParentReview = "parent_review"
}

export enum AlertStatus {
  Open = "open",
  Resolved = "resolved",
  Dismissed = "dismissed"
}

export type ProofPolicy = {
  mode: "all" | "any";
  rules: Array<{
    type: ProofRuleType;
    config?: Record<string, unknown>;
  }>;
};

export type SnoozePolicy = {
  allowed: boolean;
  maxSnoozes: number;
  defaultMinutes: number;
  allowedMinutes: number[];
  hardDeadlineMinutes?: number;
  openclawCanApprove: boolean;
};

export type RewardPolicy = {
  coinsOnCompletion: number;
};

export type MissionTemplatePayload = {
  title: string;
  childProfileId: string;
  scheduledTime: string;
  recurrenceRule?: string;
  protected: boolean;
  proofPolicy: ProofPolicy;
  snoozePolicy: SnoozePolicy;
  rewardPolicy: RewardPolicy;
};

export type OpenClawAllowedAction =
  | "draft_schedule_change"
  | "recommend_snooze"
  | "write_child_message"
  | "answer_general_chat";

export type OpenClawRequest = {
  userId: string;
  role: UserRole;
  childProfileId?: string;
  personalityPresetId?: string;
  recentChatSummary: string;
  messageText: string;
  currentMissionContext?: Record<string, unknown>;
  scheduleContext?: Record<string, unknown>;
  allowedActions: OpenClawAllowedAction[];
  policyLimits: Record<string, unknown>;
};

export type OpenClawActionDraft = {
  type: ChatActionType;
  payload: Record<string, unknown>;
};

export type OpenClawResponse = {
  messageText: string;
  actionDraft?: OpenClawActionDraft;
  snoozeDecision?: "approve" | "deny" | "ask_parent";
  reason?: string;
  safetyFlags: string[];
};

export type AuthenticatedUser = {
  userId: string;
  familyId: string;
  role: UserRole;
  childProfileId?: string;
  deviceId?: string;
};

