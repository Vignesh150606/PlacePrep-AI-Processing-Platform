import type { ISODateString, PaginatedResult, UUID } from "./common";

/**
 * Identity verification status -- deliberately 'verified' rather than
 * 'approved' (see migration 0013's docstring): this is identity
 * verification, not content moderation, and the whole feature's premise
 * (badge, directory, "only verified alumni") reads wrong with 'approved'.
 */
export type AlumniVerificationStatus = "pending-review" | "verified" | "rejected" | "suspended";

export type AlumniVerificationMethod = "self-submitted" | "admin-manual" | "institution-email";

export type AlumniAvailabilityStatus = "available" | "busy" | "unavailable";

export type AlumniSortBy = "newest" | "most-helpful" | "most-contributions";

export interface AlumniProfile {
  id: UUID;
  profileId: UUID;
  fullName: string;
  avatarUrl: string | null;
  email: string;
  isAnonymous: boolean;
  currentCompanyId: string | null;
  currentCompanyName: string;
  currentRole: string;
  department: string | null;
  graduationYear: number;
  location: string | null;
  skills: string[];
  domains: string[];
  technologies: string[];
  bio: string | null;
  careerJourney: string | null;
  preparationStrategy: string | null;
  resumeTips: string | null;
  interviewTips: string | null;
  placementAdvice: string | null;
  availabilityStatus: AlumniAvailabilityStatus;
  mentorshipAvailable: boolean;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  githubUrl: string | null;
  verificationStatus: AlumniVerificationStatus;
  verificationMethod: AlumniVerificationMethod;
  verifiedBy: string | null;
  verifiedAt: ISODateString | null;
  rejectionReason: string | null;
  contributionCount: number;
  helpfulVotesReceived: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type AlumniListResult = PaginatedResult<AlumniProfile>;

export interface AlumniFilters {
  search?: string;
  companyId?: string;
  department?: string;
  graduationYear?: number;
  domain?: string;
  skill?: string;
  mentorshipAvailable?: boolean;
  status?: AlumniVerificationStatus;
  sortBy?: AlumniSortBy;
  page?: number;
  pageSize?: number;
}

/** Self-submission payload for `POST /alumni` -- always creates a
 * `pending-review` row for the signed-in user (students cannot
 * self-promote; only an admin's later verification changes that). */
export interface AlumniProfileSubmission {
  isAnonymous?: boolean;
  currentCompanyId?: string;
  currentCompanyName?: string;
  currentRole: string;
  department?: string;
  graduationYear: number;
  location?: string;
  skills?: string[];
  domains?: string[];
  technologies?: string[];
  bio?: string;
  careerJourney?: string;
  preparationStrategy?: string;
  resumeTips?: string;
  interviewTips?: string;
  placementAdvice?: string;
  mentorshipAvailable?: boolean;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  institutionEmail?: string;
}

/** Self-edit payload for `PATCH /alumni/me` -- available to the owner at
 * any verification status, so a profile can be kept current/completed
 * before or after verification. Deliberately excludes verification-adjacent
 * fields (those are admin-only, via `AlumniAdminUpdateInput`). */
export type AlumniProfileUpdateInput = Partial<AlumniProfileSubmission> & {
  availabilityStatus?: AlumniAvailabilityStatus;
};

/** Admin edit payload for `PATCH /alumni/{id}` -- superset of the
 * self-edit fields. */
export type AlumniAdminUpdateInput = AlumniProfileUpdateInput;

export interface AlumniStatusUpdateInput {
  status: "verified" | "rejected" | "suspended" | "pending-review";
  rejectionReason?: string;
}

/** Admin "Manual verification" -- creates AND immediately verifies a
 * profile on behalf of another user in one step, distinct from approving a
 * self-submitted request. */
export interface AlumniManualCreateInput extends AlumniProfileSubmission {
  profileId: string;
}

export interface AlumniAnalytics {
  totalAlumni: number;
  verifiedAlumni: number;
  companiesRepresented: number;
  departmentCounts: { department: string; count: number }[];
  mostActiveAlumni: { profileId: string; fullName: string; contributionCount: number }[];
  mentorshipAvailableCount: number;
}
