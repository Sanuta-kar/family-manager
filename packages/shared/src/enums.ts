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
