import type { Bookmark } from "@placeprep/shared";

export const mockBookmarks: Bookmark[] = [
  { id: "bm-1", userId: "user-1", targetType: "question", targetId: "q-3", createdAt: "2026-06-26T10:00:00.000Z" },
  { id: "bm-2", userId: "user-1", targetType: "question", targetId: "q-6", createdAt: "2026-06-25T10:00:00.000Z" },
  { id: "bm-3", userId: "user-1", targetType: "interview-experience", targetId: "exp-1", createdAt: "2026-06-20T10:00:00.000Z" },
];
