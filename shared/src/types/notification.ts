import type { ISODateString, UUID } from "./common";

export type NotificationType =
  | "new-company"
  | "new-resource"
  | "calendar-update"
  | "community-reply"
  | "extraction-complete"
  | "extraction-started"
  | "extraction-failed"
  | "questions-added";

export interface Notification {
  id: UUID;
  userId: UUID;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: ISODateString;
}
