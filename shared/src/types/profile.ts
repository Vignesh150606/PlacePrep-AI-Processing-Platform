import type { ISODateString, UUID } from "./common";
import type { UserRole } from "./user";

/**
 * The authenticated account record backed by the `profiles` table.
 * Distinct from `User` (which is a lightweight reference shape used for
 * embedding author/uploader info in mock-era content like questions and
 * interview experiences): `Profile` is what the backend creates
 * automatically on first Google sign-in and what `/api/v1/profiles/me`
 * returns.
 */
export interface Profile {
  id: UUID;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  college: string | null;
  department: string | null;
  /** Expected graduation year — null for alumni/admin. */
  year: number | null;
  /** 0-100, computed server-side from how many of the optional fields above are filled in. */
  profileCompletion: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Fields a user can edit themselves — excludes id/email/role/timestamps. */
export type ProfileUpdateInput = Partial<
  Pick<Profile, "fullName" | "avatarUrl" | "college" | "department" | "year">
>;
