import type { ISODateString, UUID } from "./common";

export type BookmarkableType = "question" | "interview-experience" | "pdf" | "company";

export interface Bookmark {
  id: UUID;
  userId: UUID;
  targetType: BookmarkableType;
  targetId: UUID;
  createdAt: ISODateString;
}
