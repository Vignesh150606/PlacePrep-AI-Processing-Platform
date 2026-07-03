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

/** Append-only audit trail entry — written server-side, never edited or deleted by users. */
export interface ActivityLog {
  id: UUID;
  userId: UUID;
  action: ActivityLogAction;
  /** Free-form context, e.g. { pdfId, fileName } — shape varies per action. */
  metadata: Record<string, unknown> | null;
  createdAt: ISODateString;
}
