import type { ISODateString, UUID } from "./common";

/**
 * Mirrors the AI processing job lifecycle described in the extraction
 * pipeline (Milestone 9/10): a PDF is uploaded, queued, processed by the
 * async worker, and lands in either "completed" or "failed".
 */
export type PdfProcessingStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface PDFResource {
  id: UUID;
  /** Optional in the type so Sprint 1A's mock data keeps compiling as-is. */
  title?: string;
  description?: string | null;
  fileName: string;
  fileSizeBytes: number;
  uploadedById: UUID;
  companyId: UUID | null;
  subjectId?: UUID | null;
  topicId?: UUID | null;
  /** Null once the pipeline deletes the temporary file post-extraction. */
  storageUrl: string | null;
  processingStatus: PdfProcessingStatus;
  /** Admin-set exception to the temporary-storage policy (Sprint 4). */
  keepPermanent?: boolean;
  extractedQuestionCount: number;
  /** Populated only when processingStatus === "failed". */
  errorMessage: string | null;
  uploadedAt: ISODateString;
  processedAt: ISODateString | null;
}
