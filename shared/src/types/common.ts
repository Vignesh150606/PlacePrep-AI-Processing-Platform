/**
 * Primitive aliases used across every domain model.
 * Keeping these distinct from `string`/`number` documents intent at the
 * call site and gives us a single place to tighten validation later
 * (e.g. swapping ISODateString for a branded type) without touching
 * every model that uses it.
 */
export type UUID = string;
export type ISODateString = string;

/** Shared across questions, quizzes, and interview experiences. */
export type DifficultyLevel = "easy" | "medium" | "hard";

/**
 * Moderation status for any user-submitted content that requires admin
 * approval before becoming publicly visible (questions, interview
 * experiences, community posts).
 */
export type ModerationStatus = "pending-review" | "approved" | "rejected";

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Query params for any paginated, searchable, sortable list endpoint. */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
