import type { UUID } from "./common";

export interface Topic {
  id: UUID;
  subjectId: UUID;
  name: string;
  slug: string;
}
