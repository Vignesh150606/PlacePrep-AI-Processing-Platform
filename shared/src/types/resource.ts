import type { DifficultyLevel, ISODateString, ModerationStatus, PaginatedResult } from "./common";

/**
 * The 13 resource categories the Resource Intelligence Hub supports (see
 * migration 0012's `category` check constraint -- this list must stay in
 * sync with that constraint and with `resources.py`'s `_VALID_CATEGORIES`).
 * Some read as content-scope ("company", "subject", "topic", "aptitude",
 * "technical", "interview") and some as content-format ("cheat-sheet",
 * "formula-sheet", "roadmap", "previous-paper", "external-link", "video",
 * "pdf-notes") -- a resource has exactly one category, plus optionally a
 * `subjectId`/`topicId`/`companyId` tag regardless of which category it is.
 */
export type ResourceCategory =
  | "company"
  | "subject"
  | "topic"
  | "aptitude"
  | "technical"
  | "interview"
  | "cheat-sheet"
  | "formula-sheet"
  | "roadmap"
  | "previous-paper"
  | "external-link"
  | "video"
  | "pdf-notes";

export const RESOURCE_CATEGORIES: { value: ResourceCategory; label: string }[] = [
  { value: "company", label: "Company Resource" },
  { value: "subject", label: "Subject Resource" },
  { value: "topic", label: "Topic Resource" },
  { value: "aptitude", label: "Aptitude Resource" },
  { value: "technical", label: "Technical Resource" },
  { value: "interview", label: "Interview Resource" },
  { value: "cheat-sheet", label: "Cheat Sheet" },
  { value: "formula-sheet", label: "Formula Sheet" },
  { value: "roadmap", label: "Preparation Roadmap" },
  { value: "previous-paper", label: "Previous Paper" },
  { value: "external-link", label: "External Link" },
  { value: "video", label: "Video" },
  { value: "pdf-notes", label: "PDF Notes" },
];

export type ResourceSortBy = "newest" | "most-downloaded" | "most-bookmarked";

export type ResourceFileKind = "pdf" | "image";

export interface Resource {
  id: string;
  title: string;
  description: string | null;
  category: ResourceCategory;
  subjectId: string | null;
  subjectName: string | null;
  topicId: string | null;
  topicName: string | null;
  companyId: string | null;
  companyName: string | null;
  difficulty: DifficultyLevel | null;
  tags: string[];
  author: string | null;
  uploadedBy: string;
  uploaderName: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  fileKind: ResourceFileKind | null;
  externalUrl: string | null;
  version: number;
  status: ModerationStatus;
  reviewedBy: string | null;
  reviewedAt: ISODateString | null;
  rejectionReason: string | null;
  downloadCount: number;
  bookmarkCount: number;
  uploadedAt: ISODateString;
  updatedAt: ISODateString;
}

export type ResourceListResult = PaginatedResult<Resource>;

export interface ResourceFilters {
  search?: string;
  category?: ResourceCategory;
  companyId?: string;
  subjectId?: string;
  topicId?: string;
  difficulty?: DifficultyLevel;
  tags?: string[];
  status?: ModerationStatus;
  sortBy?: ResourceSortBy;
  page?: number;
  pageSize?: number;
}

/** Submission payload for `POST /resources` -- sent as multipart form data
 * (not JSON), since a file may be attached. Exactly one of a file /
 * `externalUrl` must be provided. The actual attached-file field lives on
 * the client-only `ResourceSubmissionInput` type in
 * `client/src/hooks/use-resources.ts` rather than here, since this shared
 * package is also consumed by the (non-browser) server and deliberately
 * never references DOM types like `File` (see `file-upload.ts`'s
 * `FileUploadConstraints`, which does the same thing). */
export interface ResourceSubmission {
  title: string;
  description?: string;
  category: ResourceCategory;
  subjectId?: string;
  topicId?: string;
  companyId?: string;
  difficulty?: DifficultyLevel;
  tags?: string[];
  author?: string;
  externalUrl?: string;
}

export interface ResourceUpdateInput {
  title?: string;
  description?: string;
  category?: ResourceCategory;
  subjectId?: string;
  topicId?: string;
  companyId?: string;
  difficulty?: DifficultyLevel;
  tags?: string[];
  author?: string;
  externalUrl?: string;
}

export interface ResourceStatusUpdateInput {
  status: "approved" | "rejected";
  rejectionReason?: string;
}

export type ResourceBulkActionType = "approve" | "reject" | "delete";

export interface ResourceBulkActionInput {
  resourceIds: string[];
  action: ResourceBulkActionType;
  rejectionReason?: string;
}

export interface ResourceBulkActionResult {
  succeeded: string[];
  failed: { id: string; error: string }[];
}

export interface ResourceDownload {
  downloadUrl: string;
  kind: "file" | "external";
  downloadCount: number;
}
