import type { ISODateString, UUID } from "./common";

export type PdfProcessingStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

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
}
