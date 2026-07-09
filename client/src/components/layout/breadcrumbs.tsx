import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

const LABEL_OVERRIDES: Record<string, string> = {
  questions: "Question Bank",
  pdfs: "PDF Library",
  quiz: "Quiz",
  companies: "Companies",
  experiences: "Interview Experiences",
  community: "Community",
  calendar: "Calendar",
  bookmarks: "Bookmarks",
  "wrong-answers": "Wrong Answer Notebook",
  analytics: "Analytics",
  notifications: "Notifications",
  settings: "Settings",
  admin: "Admin",
  review: "Review Queue",
};

function humanize(segment: string): string {
  return (
    LABEL_OVERRIDES[segment] ??
    segment
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return <span className="text-sm font-medium text-foreground">Dashboard</span>;
  }

  let runningPath = "";

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link to="/" className="text-muted-foreground transition-colors hover:text-foreground">
        Dashboard
      </Link>
      {segments.map((segment, i) => {
        runningPath += `/${segment}`;
        const isLast = i === segments.length - 1;
        return (
          <span key={runningPath} className="flex items-center gap-1.5">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            {isLast ? (
              <span className="font-medium text-foreground" aria-current="page">
                {humanize(segment)}
              </span>
            ) : (
              <Link to={runningPath} className="text-muted-foreground transition-colors hover:text-foreground">
                {humanize(segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
