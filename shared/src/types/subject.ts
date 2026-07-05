import type { UUID } from "./common";

export interface Subject {
  id: UUID;
  name: string;
  slug: string;
}
