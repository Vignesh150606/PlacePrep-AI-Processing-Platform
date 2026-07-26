import type { CompanyStatus, ISODateString, UUID } from "./common";

export type CompanyTier = "dream" | "super-dream" | "core" | "mass-recruiter";

export interface Company {
  id: UUID;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string;
  website: string | null;
  industry: string;
  tier: CompanyTier;
  roles: string[];
  averagePackageLpa: number | null;
  questionCount: number;
  experienceCount: number;
  upcomingVisitDate: ISODateString | null;
  createdAt: ISODateString;
  // Phase 18 -- Company Admin Management. Present for every company (a
  // student browsing the live directory only ever sees `status: "active"`
  // rows in the first place -- see companies.py's `list_companies` -- so
  // these are safe to always include rather than admin-only-gate the
  // fields themselves).
  status: CompanyStatus;
  archivedAt: ISODateString | null;
  archivedBy: UUID | null;
  updatedAt: ISODateString;
  /** Admin-only in practice: only ever populated on the admin "Deleted"
   * tab's own query (`GET /companies?deleted=true`), which is the only
   * caller that ever sees a soft-deleted row at all. */
  deletedAt: ISODateString | null;
  deletedBy: UUID | null;
}

export interface CompanyListResult {
  items: Company[];
}

/** `POST /companies` -- admin-only. `name`/`industry`/`tier` are the only
 * required fields; everything else matches what classification would have
 * filled in automatically for an auto-upserted company. */
export interface CompanyCreateInput {
  name: string;
  industry: string;
  tier: CompanyTier;
  description?: string;
  website?: string;
  roles?: string[];
  averagePackageLpa?: number;
  upcomingVisitDate?: ISODateString;
  logoUrl?: string;
}

/** `PATCH /companies/{id}` -- admin-only, every field independently
 * optional (same "send only what changed" shape as `ResourceUpdateInput`). */
export interface CompanyUpdateInput {
  name?: string;
  industry?: string;
  tier?: CompanyTier;
  description?: string;
  website?: string;
  roles?: string[];
  averagePackageLpa?: number | null;
  upcomingVisitDate?: ISODateString | null;
  logoUrl?: string | null;
}

/** `POST /companies/bulk-action`'s `action` enum -- same archive/unarchive/
 * delete/restore/permanent-delete shape as `ResourceBulkActionType`, minus
 * approve/reject (a company is never in a review queue to begin with). */
export type CompanyBulkActionType = "archive" | "unarchive" | "delete" | "restore" | "permanent-delete";

export interface CompanyBulkActionInput {
  companyIds: string[];
  action: CompanyBulkActionType;
}

export interface CompanyBulkActionResult {
  succeeded: string[];
  failed: { id: string; error: string }[];
  /** Set only for actions with a clean, one-call inverse -- same
   * "Undo when possible" shape as `ResourceBulkActionResult.undoAction`. */
  undoAction: CompanyBulkActionType | null;
}

/** `POST /companies/{canonicalId}/merge` -- see `company_merge.py` for what
 * actually gets reassigned. Mirrors `QuestionMergeResponse`'s shape: report
 * exactly what moved rather than a bare success flag, so an admin can
 * confirm nothing silently vanished. */
export interface CompanyMergeInput {
  duplicateId: string;
}

export interface CompanyMergeResult {
  canonicalId: string;
  duplicateId: string;
  questionLinksReassigned: number;
  interviewExperiencesReassigned: number;
  resourcesReassigned: number;
  alumniProfilesReassigned: number;
  communityPostsReassigned: number;
  calendarEventsReassigned: number;
  bookmarksReassigned: number;
  bookmarksDroppedAsDuplicate: number;
}
