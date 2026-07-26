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

/** Phase 18 -- Company Admin Management. Companies were previously
 * read-only (auto-upserted by classification, no admin create/update/
 * archive endpoints existed at all -- see companies.py's pre-Phase-18
 * docstring). Unlike `QuestionLifecycleStatus`/`ResourceLifecycleStatus`,
 * a company never goes through draft/pending-review/approved/rejected --
 * it's either live in the directory or archived out of it, so this is a
 * deliberately smaller, two-state enum rather than reusing `ModerationStatus`
 * for a workflow companies never actually have. Soft delete (`deletedAt`)
 * is independent of `status`, same convention as questions/resources. */
export type CompanyStatus = "active" | "archived";

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
