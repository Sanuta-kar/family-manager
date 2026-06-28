import { z } from "zod";
import { AlertStatus, ProofRuleType } from "./enums";

// 24-hour "HH:MM"
const scheduledTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "scheduledTime must be HH:MM (24-hour)");

// "YYYY-MM-DD"
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

// --- Mission policy schemas (source of truth for the policy types) ---

export const ProofPolicySchema = z.object({
  mode: z.enum(["all", "any"]),
  rules: z.array(
    z.object({
      type: z.nativeEnum(ProofRuleType),
      config: z.record(z.unknown()).optional()
    })
  )
});
export type ProofPolicy = z.infer<typeof ProofPolicySchema>;

export const SnoozePolicySchema = z.object({
  allowed: z.boolean(),
  maxSnoozes: z.number().int().nonnegative(),
  defaultMinutes: z.number().int().positive(),
  allowedMinutes: z.array(z.number().int().positive()),
  hardDeadlineMinutes: z.number().int().positive().optional(),
  openclawCanApprove: z.boolean()
});
export type SnoozePolicy = z.infer<typeof SnoozePolicySchema>;

export const RewardPolicySchema = z.object({
  coinsOnCompletion: z.number().int().nonnegative()
});
export type RewardPolicy = z.infer<typeof RewardPolicySchema>;

export const MissionTemplatePayloadSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  childProfileId: z.string().trim().min(1, "childProfileId is required"),
  scheduledTime: scheduledTimeSchema,
  recurrenceRule: z.string().trim().min(1).optional(),
  protected: z.boolean(),
  proofPolicy: ProofPolicySchema,
  snoozePolicy: SnoozePolicySchema,
  rewardPolicy: RewardPolicySchema
});
export type MissionTemplatePayload = z.infer<typeof MissionTemplatePayloadSchema>;

export const UpdateMissionTemplateInputSchema = MissionTemplatePayloadSchema.partial();
export type UpdateMissionTemplateInput = z.infer<typeof UpdateMissionTemplateInputSchema>;

// --- Auth ---

export const BootstrapParentInputSchema = z.object({
  familyName: z.string().trim().min(1, "familyName is required"),
  name: z.string().trim().min(1, "name is required"),
  email: z.string().trim().email(),
  password: z.string().min(8, "password must be at least 8 characters")
});
export type BootstrapParentInput = z.infer<typeof BootstrapParentInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, "password is required")
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const RefreshInputSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required")
});
export type RefreshInput = z.infer<typeof RefreshInputSchema>;

// --- Devices ---

export const CreatePairingCodeInputSchema = z.object({
  childProfileId: z.string().trim().min(1, "childProfileId is required"),
  expiresInMinutes: z.number().int().positive().optional()
});
export type CreatePairingCodeInput = z.infer<typeof CreatePairingCodeInputSchema>;

export const ClaimDeviceInputSchema = z.object({
  code: z.string().trim().min(1, "code is required"),
  deviceName: z.string().trim().min(1, "deviceName is required"),
  platform: z.enum(["android", "ios", "web"]),
  fcmToken: z.string().min(1).optional()
});
export type ClaimDeviceInput = z.infer<typeof ClaimDeviceInputSchema>;

export const RegisterFcmTokenInputSchema = z.object({
  fcmToken: z.string().min(1, "fcmToken is required")
});
export type RegisterFcmTokenInput = z.infer<typeof RegisterFcmTokenInputSchema>;

// --- Children ---

export const CreateChildInputSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  timezone: z.string().trim().min(1).optional()
});
export type CreateChildInput = z.infer<typeof CreateChildInputSchema>;

// --- Missions (actions) ---

export const SnoozeInputSchema = z.object({
  requestedMinutes: z.number().int().positive(),
  source: z.string().trim().min(1).optional()
});
export type SnoozeInput = z.infer<typeof SnoozeInputSchema>;

export const SubmitProofInputSchema = z.object({
  type: z.string().trim().min(1, "type is required"),
  payload: z.record(z.unknown()),
  confidence: z.number().min(0).max(1).optional()
});
export type SubmitProofInput = z.infer<typeof SubmitProofInputSchema>;

export const ParentReviewInputSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().min(1).optional()
});
export type ParentReviewInput = z.infer<typeof ParentReviewInputSchema>;

export const TodayQuerySchema = z.object({
  date: isoDateSchema.optional()
});
export type TodayQuery = z.infer<typeof TodayQuerySchema>;

// --- Chat ---

export const CreateThreadInputSchema = z.object({
  title: z.string().trim().min(1).optional(),
  childProfileId: z.string().trim().min(1).optional()
});
export type CreateThreadInput = z.infer<typeof CreateThreadInputSchema>;

export const SendMessageInputSchema = z.object({
  text: z.string().trim().min(1, "text is required")
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

// --- Alerts ---

export const UpdateAlertInputSchema = z.object({
  status: z.nativeEnum(AlertStatus)
});
export type UpdateAlertInput = z.infer<typeof UpdateAlertInputSchema>;
