import type { DifficultyLevel, ISODateString, UUID } from "./common";

export type QuizMode = "topic" | "company" | "mixed" | "random" | "wrong-answers";

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
}

export interface QuizAttempt {
  id: UUID;
  quizId: UUID;
  userId: UUID;
  status: QuizAttemptStatus;
  responses: QuestionResponse[];
  score: number;
  totalQuestions: number;
  correctCount: number;
  startedAt: ISODateString;
  completedAt: ISODateString | null;
}
