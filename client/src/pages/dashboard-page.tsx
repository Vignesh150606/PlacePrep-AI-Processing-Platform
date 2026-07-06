import { Link } from "@tanstack/react-router";
import { Bookmark, BookOpenText, ClipboardList, FileStack, Upload } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { PracticeTrendChart } from "@/components/dashboard/practice-trend-chart";
import { ContinuePracticeCard } from "@/components/dashboard/continue-practice-card";
import { UpcomingCompaniesCard } from "@/components/dashboard/upcoming-companies-card";
import { RecentPdfsCard } from "@/components/dashboard/recent-pdfs-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { useAuth } from "@/hooks/use-auth";
import { useQuestions } from "@/hooks/use-questions";
import { usePdfs } from "@/hooks/use-pdfs";
import { useBookmarks } from "@/hooks/use-bookmarks";

/**
 * FIX (Part 3 of the Sprint 4 polish pass — "remove fake data"): every stat
 * on this page used to come from mocks/*.ts (fake quiz attempts, fake
 * bookmarks, a hardcoded "Today's challenge" block, a fake weekly trend
 * chart). Now:
 *  - "PDFs uploaded" / "Questions in bank" are real counts from the API.
 *  - "Bookmarked this session" is real (session-only — see use-bookmarks.ts).
 *  - "Quizzes completed" honestly shows "—": there's no Quiz Attempt
 *    backend yet (Sprint 5), so there's nothing real to report.
 *  - The old "Today's challenge" block named a specific fake topic/question
 *    count that was never actually assembled for the user; removed rather
 *    than replaced, since a real personalized recommendation needs the Quiz
 *    Engine's attempt history to mean anything.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(" ")[0] ?? "there";
  const { data: questionData } = useQuestions();
  const { data: pdfData } = usePdfs();
  const { bookmarkedCount } = useBookmarks();

  const questionCount = questionData?.total ?? 0;
  const pdfCount = pdfData?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's where your placement prep stands today.
          </p>
        </div>
        <Button asChild>
          <Link to="/pdfs">
            <Upload className="size-4" />
            Upload a PDF
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="PDFs uploaded" value={pdfCount} icon={FileStack} />
        <StatCard label="Questions in bank" value={questionCount} icon={BookOpenText} />
        <StatCard label="Bookmarked this session" value={bookmarkedCount} icon={Bookmark} />
        <StatCard label="Quizzes completed" value="—" icon={ClipboardList} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PracticeTrendChart />
        </div>
        <ContinuePracticeCard />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <UpcomingCompaniesCard />
        <RecentPdfsCard />
        <RecentActivityCard />
      </div>
    </div>
  );
}
