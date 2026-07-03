import type { UUID } from "./common";

/** e.g. "Data Structures & Algorithms", "DBMS", "Operating Systems". */
export interface Subject {
  id: UUID;
  name: string;
  slug: string;
}
