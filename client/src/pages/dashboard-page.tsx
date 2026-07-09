import { Link } from "@tanstack/react-router";
import { Bookmark, BookOpenText, ClipboardList, FileStack, Upload, XCircle } from "lucide-react";
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
import { useBookmarksList } from "@/hooks/use-bookmarks";
import { useQuizAttempts } from "@/hooks/use-quiz-attempts";
import { useWrongAnswers } from "@/hooks/use-wrong-answers";

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(" ")[0] ?? "there";
  const { data: questionData, isLoading: questionsLoading } = useQuestions();
  const { data: pdfData, isLoading: pdfsLoading } = usePdfs();
  const { data: bookmarkData, isLoading: bookmarksLoading } = useBookmarksList();
  const { data: attemptData, isLoading: attemptsLoading } = useQuizAttempts();
  const { data: wrongAnswerData } = useWrongAnswers();

  const questionCount = questionData?.total ?? 0;
  const pdfCount = pdfData?.total ?? 0;
  const bookmarkedCount = (bookmarkData?.items ?? []).length;
  const quizzesCompleted = (attemptData?.items ?? []).filter((a) => a.status === "completed").length;
  const wrongAnswerCount = (wrongAnswerData?.items ?? []).filter((w) => !w.resolved).length;

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
        <StatCard label="PDFs uploaded" value={pdfCount} icon={FileStack} isLoading={pdfsLoading} />
        <StatCard
          label="Questions in bank"
          value={questionCount}
          icon={BookOpenText}
          isLoading={questionsLoading}
        />
        <StatCard
          label="Quizzes completed"
          value={quizzesCompleted}
          icon={ClipboardList}
          isLoading={attemptsLoading}
        />
        <StatCard
          label="Bookmarked questions"
          value={bookmarkedCount}
          icon={Bookmark}
          isLoading={bookmarksLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PracticeTrendChart />
        </div>
        <ContinuePracticeCard />
      </div>

      {wrongAnswerCount > 0 && (
        <Link
          to="/wrong-answers"
          className="flex items-center justify-between gap-3 rounded-xl border border-incorrect-500/30 bg-incorrect-500/5 px-4 py-3 text-sm transition-colors hover:bg-incorrect-500/10"
        >
          <span className="flex items-center gap-2 text-incorrect-600 dark:text-incorrect-500">
            <XCircle className="size-4" />
            {wrongAnswerCount} question{wrongAnswerCount === 1 ? "" : "s"} to review in your Wrong Answer Notebook
          </span>
          <span className="font-medium text-incorrect-600 dark:text-incorrect-500">Review now →</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <UpcomingCompaniesCard />
        <RecentPdfsCard />
        <RecentActivityCard />
      </div>
    </div>
  );
}
