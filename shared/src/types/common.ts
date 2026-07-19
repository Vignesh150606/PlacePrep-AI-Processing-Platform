export type UUID = string;
export type ISODateString = string;

export type DifficultyLevel = "easy" | "medium" | "hard";

export type ModerationStatus = "pending-review" | "approved" | "rejected";

/** Phase 13 -- Question Authoring System. `"draft"` is still only ever a
 * `questions` state (a manual question or bulk-parser preview row that
 * hasn't been published/submitted yet); `interview-experiences` still only
 * ever uses `ModerationStatus` above. Phase 15, Part 1 added "archived" --
 * see migration 0016's docstring for why "published" is NOT a separate
 * status value (it's `"approved"` under another name everywhere
 * downstream already treats it that way). */
export type QuestionLifecycleStatus = ModerationStatus | "draft" | "archived";

/** Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management. Same
 * "archived" addition as `QuestionLifecycleStatus` above (migration 0017),
 * minus `"draft"` -- a resource is never manually drafted the way an
 * admin-authored question can be, so its lifecycle has one fewer state. */
export type ResourceLifecycleStatus = ModerationStatus | "archived";

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
