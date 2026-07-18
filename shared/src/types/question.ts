import type { DifficultyLevel, ISODateString, QuestionLifecycleStatus, UUID } from "./common";

export type QuestionType = "mcq" | "multi-select" | "coding" | "subjective";

/** Phase 13 -- how a question entered the bank. AI is the original (and
 * still only automated) path; the other three are the new manual entry
 * points -- see `services/question_authoring.py`. */
export type QuestionSourceType = "AI" | "ADMIN_MANUAL" | "STUDENT_MANUAL" | "BULK_IMPORT";

/** Phase 13 -- how the underlying content reached the platform, independent
 * of who authored it (e.g. an admin manually retyping a question they read
 * off a photo is still `submissionMethod: "MANUAL"`, not "IMAGE" -- that
 * field is reserved for the AI pipeline's own PDF/image uploads). */
export type QuestionSubmissionMethod = "PDF" | "IMAGE" | "TEXT" | "MANUAL";

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
  /** Phase 13 -- full worked solution, distinct from the shorter
   * `correctExplanation` (why the answer is correct vs. how to get there). */
  solutionSteps: string | null;
  /** Phase 13 -- a short placement-interview-specific tip, separate from
   * the general explanation/solution. */
  interviewTip: string | null;
  /** Phase 13 -- free-text reference (a book, a URL, a course module). */
  referenceNote: string | null;
  topic: string;
  subject: string;
  companyId: UUID | null;
  difficulty: DifficultyLevel;
  sourcePdfId: UUID | null;
  pageNumber: number | null;
  status: QuestionLifecycleStatus;
  confidenceScore?: number;
  tags: string[];
  /** Phase 13 -- question-body diagrams/screenshots. */
  imageUrls: string[];
  /** Phase 13 -- supplementary reference files. */
  attachmentUrls: string[];
  sourceType: QuestionSourceType;
  submissionMethod: QuestionSubmissionMethod | null;
  createdBy: UUID | null;
  reviewedBy: UUID | null;
  reviewedAt: ISODateString | null;
  rejectionReason: string | null;
  timesAttempted: number;
  timesCorrect: number;
  createdAt: ISODateString;
}

/** Phase 13 -- shape shared by the Admin Manual Builder and Student
 * Submission forms (bulk-imported questions build this same shape
 * internally per parsed row -- see `question_authoring.py`). */
export interface QuestionAuthoringInput {
  type: QuestionType;
  text: string;
  options: Array<{ label: string; text: string; isCorrect: boolean }>;
  correctExplanation?: string | null;
  solutionSteps?: string | null;
  interviewTip?: string | null;
  referenceNote?: string | null;
  difficulty: DifficultyLevel;
  subject?: string | null;
  topic?: string | null;
  companyName?: string | null;
  tags?: string[];
  imageUrls?: string[];
  attachmentUrls?: string[];
}

/** Phase 13 -- one row of a Smart Bulk Parser preview, before import. */
export type BulkParsePreviewStatus =
  | "parsed"
  | "warning-missing-answer"
  | "warning-missing-option"
  | "warning-duplicate"
  | "invalid";

export interface BulkParsePreviewItem {
  index: number;
  status: BulkParsePreviewStatus;
  warnings: string[];
  rawBlock: string;
  parsed: QuestionAuthoringInput | null;
  duplicateOfQuestionId: UUID | null;
}

export interface BulkParseResponse {
  items: BulkParsePreviewItem[];
  totalDetected: number;
  totalParsedClean: number;
  totalWarnings: number;
  totalInvalid: number;
}

export interface QuestionImportBatch {
  id: UUID;
  adminId: UUID;
  label: string | null;
  totalDetected: number;
  totalImported: number;
  totalDuplicate: number;
  totalError: number;
  createdAt: ISODateString;
}
