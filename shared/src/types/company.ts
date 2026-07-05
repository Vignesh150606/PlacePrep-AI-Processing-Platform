import type { ISODateString, UUID } from "./common";

export type CompanyTier = "dream" | "super-dream" | "core" | "mass-recruiter";

export interface Company {
  id: UUID;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string;
  website: string | null;
  industry: string;
  tier: CompanyTier;
  roles: string[];
  averagePackageLpa: number | null;
  questionCount: number;
  experienceCount: number;
  upcomingVisitDate: ISODateString | null;
  createdAt: ISODateString;
}
