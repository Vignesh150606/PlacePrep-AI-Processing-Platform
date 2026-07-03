import type { ISODateString, UUID } from "./common";

/**
 * Common placement-season classification. Kept as a closed union rather
 * than a free-text field so quiz generation and filtering can rely on it.
 */
export type CompanyTier = "dream" | "super-dream" | "core" | "mass-recruiter";

export interface Company {
  id: UUID;
  name: string;
  /** URL-safe identifier, e.g. "amazon" — used for /companies/:slug routes. */
  slug: string;
  logoUrl: string | null;
  description: string;
  website: string | null;
  industry: string;
  tier: CompanyTier;
  roles: string[];
  averagePackageLpa: number | null;
  /** Denormalized counts for list views — recomputed server-side on writes. */
  questionCount: number;
  experienceCount: number;
  upcomingVisitDate: ISODateString | null;
  createdAt: ISODateString;
}
