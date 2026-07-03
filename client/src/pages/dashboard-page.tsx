import { Link } from "@tanstack/react-router";
import { BookOpenText, Bookmark, ClipboardList, XCircle, Upload, Sparkles } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { PracticeTrendChart } from "@/components/dashboard/practice-trend-chart";
import { ContinuePracticeCard } from "@/components/dashboard/continue-practice-card";
import { UpcomingCompaniesCard } from "@/components/dashboard/upcoming-companies-card";
import { RecentPdfsCard } from "@/components/dashboard/recent-pdfs-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { useAuth } from "@/hooks/use-auth";
import { mockQuestions } from "@/mocks/questions";
import { mockBookmarks } from "@/mocks/bookmarks";
import { mockQuizAttempts } from "@/mocks/quizzes";

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(" ")[0] ?? "there";
  const wrongAnswerCount = mockQuizAttempts
    .flatMap((a) => a.responses)
    .filter((r) => !r.isCorrect).length;

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
        <StatCard
          label="Questions practiced"
          value={mockQuestions.reduce((sum, q) => sum + q.timesAttempted, 0)}
          icon={BookOpenText}
          trend={{ value: 12, label: "vs last week" }}
        />
        <StatCard
          label="Quizzes completed"
          value={mockQuizAttempts.filter((a) => a.status === "completed").length}
          icon={ClipboardList}
        />
        <StatCard label="Wrong answers to review" value={wrongAnswerCount} icon={XCircle} />
        <StatCard label="Bookmarks" value={mockBookmarks.length} icon={Bookmark} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PracticeTrendChart />
        </div>
        <ContinuePracticeCard />
      </div>

      <div>
        <SectionHeader
          title="Today's challenge"
          description="A quick mixed-difficulty set picked from your weak topics"
          className="mb-3"
        />
        <div className="flex items-center gap-4 rounded-xl border border-accent-600/20 bg-accent-600/5 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-600/15 text-accent-600 dark:text-accent-400">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">5 questions &middot; Operating Systems &amp; DBMS</p>
            <p className="text-sm text-muted-foreground">Estimated 8 minutes</p>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link to="/quiz">Start</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <UpcomingCompaniesCard />
        <RecentPdfsCard />
        <RecentActivityCard />
      </div>
    </div>
  );
}
