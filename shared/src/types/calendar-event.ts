import type { ISODateString, UUID } from "./common";

export type CalendarEventType =
  | "oa"
  | "interview"
  | "company-visit"
  | "reminder"
  | "workshop";

/** Phase 8: lifecycle of a placement-drive event. Defaults to "upcoming" on
 * creation; an admin moves it to "cancelled" (reschedule = edit the date
 * fields directly rather than a separate status) or lets it fall through
 * to "ongoing"/"completed" as the drive date passes -- there's no
 * background job driving that transition yet, see calendar.ts hook notes. */
export type CalendarEventStatus = "upcoming" | "ongoing" | "completed" | "cancelled";

export interface CalendarEvent {
  id: UUID;
  title: string;
  type: CalendarEventType;
  companyId: UUID | null;
  startAt: ISODateString;
  endAt: ISODateString | null;
  isAllDay: boolean;
  createdById: UUID | null;
  description: string | null;
  // --- Phase 8: Placement Calendar fields ---
  role?: string | null;
  packageLpa?: number | null;
  eligibility?: string | null;
  registrationDeadline?: ISODateString | null;
  venue?: string | null;
  isOnline?: boolean;
  applicationLink?: string | null;
  attachmentUrl?: string | null;
  status?: CalendarEventStatus;
  updatedAt?: ISODateString;
}
