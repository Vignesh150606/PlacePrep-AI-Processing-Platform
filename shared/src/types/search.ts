import type { DifficultyLevel, ModerationStatus, UUID } from "./common";
import type { CompanyTier } from "./company";
import type { PdfProcessingStatus } from "./pdf-resource";

export interface SearchQuestionResult {
  id: UUID;
  text: string;
  difficulty: DifficultyLevel;
  status: ModerationStatus;
}

export interface SearchCompanyResult {
  id: UUID;
  name: string;
  slug: string;
  tier: CompanyTier;
}

export interface SearchPdfResult {
  id: UUID;
  title: string;
  fileName: string;
  processingStatus: PdfProcessingStatus;
}

export interface SearchResponse {
  query: string;
  questions: SearchQuestionResult[];
  companies: SearchCompanyResult[];
  pdfs: SearchPdfResult[];
  totalResults: number;
}
