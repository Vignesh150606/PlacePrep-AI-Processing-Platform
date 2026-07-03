import type { Notification } from "@placeprep/shared";

export const mockNotifications: Notification[] = [
  {
    id: "notif-1",
    userId: "user-1",
    type: "extraction-complete",
    title: "Question extraction complete",
    message: "24 questions were extracted from Amazon_SDE1_2026_OA_Questions.pdf.",
    isRead: false,
    linkUrl: "/questions",
    createdAt: "2026-06-30T08:02:00.000Z",
  },
  {
    id: "notif-2",
    userId: "user-1",
    type: "calendar-update",
    title: "Upcoming: Amazon campus visit",
    message: "Amazon is visiting campus on 14 Aug 2026 for SDE-1 roles.",
    isRead: false,
    linkUrl: "/calendar",
    createdAt: "2026-06-29T18:00:00.000Z",
  },
  {
    id: "notif-3",
    userId: "user-1",
    type: "community-reply",
    title: "New reply on your post",
    message: "Rahul replied to your question about TCS Digital's coding round.",
    isRead: true,
    linkUrl: "/community",
    createdAt: "2026-06-28T14:30:00.000Z",
  },
  {
    id: "notif-4",
    userId: "user-1",
    type: "new-company",
    title: "New company page: Atlassian",
    message: "A preparation hub for Atlassian is now available.",
    isRead: true,
    linkUrl: "/companies/atlassian",
    createdAt: "2026-06-26T09:00:00.000Z",
  },
];
