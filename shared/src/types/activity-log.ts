import type { ISODateString, UUID } from "./common";

export type ActivityLogAction =
  | "login"
  | "logout"
  | "profile-created"
  | "profile-updated"
  | "pdf-uploaded"
  | "pdf-deleted"
  | "bookmark-added"
  | "bookmark-removed"
  | "calendar-event-created";

export interface ActivityLog {
  id: UUID;
  userId: UUID;
  action: ActivityLogAction;
  metadata: Record<string, unknown> | null;
  createdAt: ISODateString;
}
