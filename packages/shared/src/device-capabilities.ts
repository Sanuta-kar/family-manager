import { z } from "zod";
import { DeviceCommandResultStatus, UserRole } from "./enums";

/**
 * Read-only device context capabilities OpenClaw may request in V1. Each maps to one
 * Android OS integration mechanism, executed on-device by the family-manager app — never
 * by OpenClaw. See docs/features/device-action-bridge.md.
 */
export enum DeviceCapabilityKind {
  Calendar = "calendar",
  AppUsage = "app_usage",
  DeviceState = "device_state"
}

export interface DeviceCapabilityPolicy {
  /** Read-only/low-risk capabilities can be dispatched without a Confirm card. */
  readOnly: boolean;
  /** Roles permitted to request the capability. */
  allowedRoles: UserRole[];
}

/** The V1 capability set: read-only context, requestable by a child for their own device. */
export const DEVICE_CAPABILITY_POLICY: Record<DeviceCapabilityKind, DeviceCapabilityPolicy> = {
  [DeviceCapabilityKind.Calendar]: { readOnly: true, allowedRoles: [UserRole.Child, UserRole.Parent] },
  [DeviceCapabilityKind.AppUsage]: { readOnly: true, allowedRoles: [UserRole.Child, UserRole.Parent] },
  [DeviceCapabilityKind.DeviceState]: { readOnly: true, allowedRoles: [UserRole.Child, UserRole.Parent] }
};

export function isKnownDeviceCapability(value: string): value is DeviceCapabilityKind {
  return (Object.values(DeviceCapabilityKind) as string[]).includes(value);
}

/** Payload of a `read_device_context` action draft from OpenClaw. */
export const ReadDeviceContextPayloadSchema = z.object({
  kind: z.nativeEnum(DeviceCapabilityKind),
  range: z.string().trim().min(1).optional()
});
export type ReadDeviceContextPayload = z.infer<typeof ReadDeviceContextPayloadSchema>;

/** Body a parent sends to enable/disable a capability for a device. */
export const SetCapabilityGrantInputSchema = z.object({
  enabled: z.boolean()
});
export type SetCapabilityGrantInput = z.infer<typeof SetCapabilityGrantInputSchema>;

/** Body a device POSTs to report a command's outcome (idempotent by command id). */
export const DeviceCommandResultInputSchema = z.object({
  status: z.nativeEnum(DeviceCommandResultStatus),
  payload: z.record(z.unknown()).optional(),
  error: z.string().trim().min(1).optional()
});
export type DeviceCommandResultInput = z.infer<typeof DeviceCommandResultInputSchema>;
