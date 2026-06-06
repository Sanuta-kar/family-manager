import { ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser, UserRole } from "@family-manager/shared";

export function assertParent(user: AuthenticatedUser) {
  if (user.role !== UserRole.Parent) {
    throw new ForbiddenException("Parent role required");
  }
}

export function assertChildCanAccess(user: AuthenticatedUser, childProfileId: string) {
  if (user.role === UserRole.Parent) {
    return;
  }
  if (user.childProfileId !== childProfileId) {
    throw new ForbiddenException("Child can access only their own profile");
  }
}

