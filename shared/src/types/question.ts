import type { DifficultyLevel, ISODateString, ModerationStatus, UUID } from "./common";

export type QuestionType = "mcq" | "multi-select" | "coding" | "subjective";

export interface QuestionOption {
  id: UUID;
  questionId: UUID;
  label: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: UUID;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  correctExplanation: string | null;
  topic: string;
  subject: string;
  companyId: UUID | null;
  difficulty: DifficultyLevel;
  sourcePdfId: UUID | null;
  pageNumber: number | null;
  status: ModerationStatus;
  confidenceScore?: number;
  tags: string[];
  timesAttempted: number;
  timesCorrect: number;
  createdAt: ISODateString;
}
