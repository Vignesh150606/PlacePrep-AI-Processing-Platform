import type { ISODateString, UUID } from "./common";

export type UserRole = "student" | "alumni" | "admin";

export interface User {
  id: UUID;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  graduationYear: number | null;
  branch: string | null;
  reputationPoints: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
