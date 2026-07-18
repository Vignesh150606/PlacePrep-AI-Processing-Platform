export type UUID = string;
export type ISODateString = string;

export type DifficultyLevel = "easy" | "medium" | "hard";

export type ModerationStatus = "pending-review" | "approved" | "rejected";

/** Phase 13 -- Question Authoring System. Only `questions` uses this today
 * (a draft manual question or bulk-parser preview row that hasn't been
 * published/submitted yet); `resources`/`interview-experiences` still only
 * ever use `ModerationStatus` above. */
export type QuestionLifecycleStatus = ModerationStatus | "draft";

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
