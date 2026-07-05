import type { ISODateString, UUID } from "./common";

export type CalendarEventType =
  | "oa"
  | "interview"
  | "company-visit"
  | "reminder"
  | "workshop";

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
}
