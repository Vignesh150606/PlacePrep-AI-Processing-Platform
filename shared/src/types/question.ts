import type { DifficultyLevel, ISODateString, ModerationStatus, UUID } from "./common";

export type QuestionType = "mcq" | "multi-select" | "coding" | "subjective";

export interface QuestionOption {
  id: UUID;
  questionId: UUID;
  /** Display label, e.g. "A" — kept separate from `text` for stable ordering. */
  label: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: UUID;
  type: QuestionType;
  text: string;
  /** Empty array for "coding" and "subjective" question types. */
  options: QuestionOption[];
  correctExplanation: string | null;
  topic: string;
  subject: string;
  companyId: UUID | null;
  difficulty: DifficultyLevel;
  /** Null when manually authored rather than extracted from an upload. */
  sourcePdfId: UUID | null;
  /** AI-extracted questions enter as "pending-review" until an admin approves them. */
  status: ModerationStatus;
  /** Set for AI-extracted questions; absent for manually authored ones. */
  confidenceScore?: number;
  tags: string[];
  timesAttempted: number;
  timesCorrect: number;
  createdAt: ISODateString;
}
