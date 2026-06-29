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
  RequestSnooze = "request_snooze",
  ReadDeviceContext = "read_device_context"
}

export enum DeviceCommandStatus {
  Pending = "pending",
  Dispatched = "dispatched",
  Completed = "completed",
  Failed = "failed",
  Rejected = "rejected",
  Expired = "expired"
}

export enum DeviceCommandResultStatus {
  Completed = "completed",
  Failed = "failed",
  PermissionRequired = "permission_required"
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
