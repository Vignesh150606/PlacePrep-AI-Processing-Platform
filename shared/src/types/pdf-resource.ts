import type { ISODateString, UUID } from "./common";

// PHASE 7: a fresh upload now lands in "pending-approval" and stays there
// until an admin approves (-> "queued") or rejects (-> "rejected") it --
// AI extraction no longer starts automatically on upload. See
// server/app/api/v1/endpoints/pdfs.py's module docstring for why.
export type PdfProcessingStatus =
  | "uploaded"
  | "pending-approval"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "rejected";

/** Phase 6: a PDF Library upload can now be a real PDF or a directly
 * uploaded photo/screenshot of a question paper -- see
 * server/app/services/pipeline.py and shared/file-upload.ts's
 * IMAGE_UPLOAD_CONSTRAINTS. Optional so existing mock data / any code
 * built against the pre-Phase-6 shape keeps typechecking unchanged;
 * absence means "pdf" (matching the migration's column default). */
export type FileKind = "pdf" | "image";

export interface PDFResource {
  id: UUID;
  title?: string;
  description?: string | null;
  fileName: string;
  fileSizeBytes: number;
  fileKind?: FileKind;
  uploadedById: UUID;
  companyId: UUID | null;
  subjectId?: UUID | null;
  topicId?: UUID | null;
  storageUrl: string | null;
  processingStatus: PdfProcessingStatus;
  keepPermanent?: boolean;
  extractedQuestionCount: number;
  errorMessage: string | null;
  uploadedAt: ISODateString;
  processedAt: ISODateString | null;
  /** Phase 7 -- upload approval workflow. Undefined/null for any upload
   * that predates this pass or hasn't been reviewed yet. */
  reviewedById?: UUID | null;
  reviewedAt?: ISODateString | null;
  rejectionReason?: string | null;
}
