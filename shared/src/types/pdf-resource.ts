import type { ISODateString, UUID } from "./common";

export type PdfProcessingStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface PDFResource {
  id: UUID;
  title?: string;
  description?: string | null;
  fileName: string;
  fileSizeBytes: number;
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
