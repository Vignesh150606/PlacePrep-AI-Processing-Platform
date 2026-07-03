import {
  LayoutDashboard,
  BookOpenText,
  FileStack,
  ClipboardList,
  Building2,
  MessagesSquare,
  Users,
  CalendarDays,
  Bookmark,
  XCircle,
  Bell,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Prepare",
    items: [
      { label: "Question Bank", href: "/questions", icon: BookOpenText },
      { label: "PDF Library", href: "/pdfs", icon: FileStack },
      { label: "Quiz", href: "/quiz", icon: ClipboardList },
      { label: "Companies", href: "/companies", icon: Building2 },
    ],
  },
  {
    label: "Community",
    items: [
      { label: "Interview Experiences", href: "/experiences", icon: MessagesSquare },
      { label: "Community", href: "/community", icon: Users },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "My Activity",
    items: [
      { label: "Bookmarks", href: "/bookmarks", icon: Bookmark },
      { label: "Wrong Answers", href: "/wrong-answers", icon: XCircle },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];
