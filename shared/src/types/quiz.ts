import type { DifficultyLevel, ISODateString, UUID } from "./common";

export type QuizMode = "topic" | "company" | "mixed" | "random" | "wrong-answers" | "bookmarks";

export interface Quiz {
  id: UUID;
  title: string;
  mode: QuizMode;
  topic: string | null;
  companyId: UUID | null;
  difficulty: DifficultyLevel | "mixed";
  questionIds: UUID[];
  questionCount: number;
  timeLimitMinutes: number | null;
  createdById: UUID;
  createdAt: ISODateString;
}

export type QuizAttemptStatus = "in-progress" | "completed" | "abandoned";

export interface QuestionResponse {
  questionId: UUID;
  selectedOptionIds: UUID[];
  isCorrect: boolean;
  timeSpentSeconds: number;
  /** True if the student never selected an option for this question. */
  wasSkipped: boolean;
  /** True if the student flagged this question via "Mark for Review". */
  markedForReview: boolean;
}

export interface QuizAttempt {
  id: UUID;
  quizId: UUID | null;
  userId: UUID;
  status: QuizAttemptStatus;
  mode: QuizMode;
  topic: string | null;
  companyId: UUID | null;
  difficulty: DifficultyLevel | "mixed";
  questionIds: UUID[];
  responses: QuestionResponse[];
  score: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  timeLimitMinutes: number | null;
  timeTakenSeconds: number;
  startedAt: ISODateString;
  completedAt: ISODateString | null;
}

/** Per-question palette state used while a quiz is in progress (not persisted
 * until submit/autosubmit — the in-progress attempt row only stores question
 * ids + start time so a page refresh can restore the shell of the session). */
export interface QuizAttemptQuestionState {
  questionId: UUID;
  selectedOptionId: UUID | null;
  markedForReview: boolean;
  visited: boolean;
}

export interface QuizAttemptStartInput {
  mode: QuizMode;
  topic: string | null;
  companyId: UUID | null;
  difficulty: DifficultyLevel | "mixed";
  questionIds: UUID[];
  timeLimitMinutes: number | null;
}

export interface QuizAttemptSubmitInput {
  attemptId: UUID;
  responses: QuestionResponse[];
  timeTakenSeconds: number;
}
