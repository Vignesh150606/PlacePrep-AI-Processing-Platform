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
  /** Null when isAnonymous is true — author identity is not stored client-side either way. */
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
}
