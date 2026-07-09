import type { ISODateString, UUID } from "./common";

export type ProcessingJobStatus = "queued" | "running" | "completed" | "failed";

export interface ProcessingJob {
  id: UUID;
  pdfResourceId: UUID;
  pdfFileName: string | null;
  status: ProcessingJobStatus;
  attempts: number;
  maxAttempts: number;
  questionsExtracted: number;
  duplicatesFound: number;
  lowConfidenceCount: number;
  ocrUsed: boolean;
  chunkCount: number;
  errorMessage: string | null;
  startedAt: ISODateString | null;
  completedAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface ProcessingDashboardStats {
  queuedJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  questionsExtractedTotal: number;
  duplicatesFoundTotal: number;
  pendingReviewCount: number;
  approvedCount: number;
  averageConfidence: number | null;
  ocrJobsTotal: number;
}
