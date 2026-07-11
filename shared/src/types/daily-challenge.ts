import type { ISODateString, UUID } from "./common";

export interface DailyChallenge {
  id: UUID;
  challengeDate: string; // "YYYY-MM-DD", UTC -- see the backend endpoint's honest timezone caveat
  questionIds: UUID[];
  completed: boolean;
  quizAttemptId: UUID | null;
  weakTopicQuestionCount: number;
}

export interface DailyChallengeCompleteInput {
  quizAttemptId: UUID;
}

export interface DailyChallengeStreak {
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: ISODateString | null;
  completedToday: boolean;
}
