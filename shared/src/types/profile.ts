import type { ISODateString, UUID } from "./common";
import type { UserRole } from "./user";

export interface Profile {
  id: UUID;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  college: string | null;
  department: string | null;
  year: number | null;
  profileCompletion: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type ProfileUpdateInput = Partial<
  Pick<Profile, "fullName" | "avatarUrl" | "college" | "department" | "year">
>;
