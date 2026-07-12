import type {
  DifficultyLevel,
  ISODateString,
  ModerationStatus,
  UUID,
} from "./common";

export type InterviewRoundType =
  | "online-assessment"
  | "technical"
  | "hr"
  | "managerial"
  | "group-discussion";

export type ExperienceOutcome = "selected" | "rejected" | "in-progress" | "withdrawn";

export type EmploymentType = "internship" | "full-time";

export interface InterviewRound {
  id: UUID;
  type: InterviewRoundType;
  title: string;
  description: string;
  durationMinutes: number | null;
}

export interface InterviewExperience {
  id: UUID;
  companyId: UUID;
  /** Null when Phase 9's anonymity redaction applies -- the API omits this
   * for `isAnonymous` submissions unless the requester is the author or an
   * admin, even though the row itself always retains it server-side. */
  authorId: UUID | null;
  isAnonymous: boolean;
  role: string;
  graduationYear: number;
  outcome: ExperienceOutcome;
  rounds: InterviewRound[];
  overallTips: string;
  difficulty: DifficultyLevel;
  upvoteCount: number;
  status: ModerationStatus;
  createdAt: ISODateString;
  // --- Phase 9 additions ---
  employmentType: EmploymentType;
  packageLpa?: number | null;
  driveDate?: ISODateString | null;
  college?: string | null;
  department?: string | null;
  resourcesUsed?: string | null;
  additionalNotes?: string | null;
  /** Consolidates the brief's separate "Aptitude Topics" / "Important
   * Concepts" asks into one tag list -- see server module docstring. */
  keyTopics?: string[] | null;
  processDuration?: string | null;
  isPinned?: boolean;
  notHelpfulCount?: number;
  /** Admin-only in practice -- the API only populates this for admin
   * requesters, to avoid a visible report count discouraging genuine
   * reports or looking like a public "this post is bad" signal. */
  reportCount?: number | null;
  /** Present only when the current user has voted -- lets the frontend
   * show which button is active without a separate lookup call. */
  myVote?: "helpful" | "not-helpful" | null;
  rejectionReason?: string | null;
  updatedAt?: ISODateString;
}
