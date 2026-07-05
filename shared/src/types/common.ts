export type UUID = string;
export type ISODateString = string;

export type DifficultyLevel = "easy" | "medium" | "hard";

export type ModerationStatus = "pending-review" | "approved" | "rejected";

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
