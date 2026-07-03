import type { CalendarEvent } from "@placeprep/shared";

export const mockCalendarEvents: CalendarEvent[] = [
  {
    id: "evt-1",
    title: "Amazon — Campus Visit & OA",
    type: "company-visit",
    companyId: "company-amazon",
    startAt: "2026-08-14T09:00:00.000Z",
    endAt: "2026-08-14T17:00:00.000Z",
    isAllDay: false,
    createdById: null,
    description: "SDE-1 hiring drive, OA followed by shortlist announcement.",
  },
  {
    id: "evt-2",
    title: "Infosys OA",
    type: "oa",
    companyId: "company-infosys",
    startAt: "2026-07-10T10:00:00.000Z",
    endAt: "2026-07-10T12:00:00.000Z",
    isAllDay: false,
    createdById: null,
    description: null,
  },
  {
    id: "evt-3",
    title: "Mock Interview Practice",
    type: "reminder",
    companyId: null,
    startAt: "2026-07-03T17:00:00.000Z",
    endAt: null,
    isAllDay: false,
    createdById: "user-1",
    description: "Self-scheduled mock interview with peer group.",
  },
];
