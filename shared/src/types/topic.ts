import type { UUID } from "./common";

/** e.g. "Arrays", "Joins", "Process Scheduling" — always scoped to a Subject. */
export interface Topic {
  id: UUID;
  subjectId: UUID;
  name: string;
  slug: string;
}
