import type { ISODateString, UUID } from "./common";

export type UserRole = "student" | "alumni" | "admin";

export interface User {
  id: UUID;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  /** null for non-student roles (alumni keep gradYear, admin does not). */
  graduationYear: number | null;
  branch: string | null;
  /** Earned by contributing approved questions, experiences, and answers. */
  reputationPoints: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
