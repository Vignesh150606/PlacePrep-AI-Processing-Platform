import { Link } from "@tanstack/react-router";
import { Bookmark, BookOpenText, ClipboardList, FileStack, Upload, XCircle } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { PracticeTrendChart } from "@/components/dashboard/practice-trend-chart";
import { ContinuePracticeCard } from "@/components/dashboard/continue-practice-card";
import { DailyChallengeCard } from "@/components/dashboard/daily-challenge-card";
import { UpcomingCompaniesCard } from "@/components/dashboard/upcoming-companies-card";
import { RecentPdfsCard } from "@/components/dashboard/recent-pdfs-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { useAuth } from "@/hooks/use-auth";
import { useQuestions } from "@/hooks/use-questions";
import { usePdfs } from "@/hooks/use-pdfs";
import { useBookmarksList } from "@/hooks/use-bookmarks";
import { useQuizAttempts } from "@/hooks/use-quiz-attempts";
import { useWrongAnswers } from "@/hooks/use-wrong-answers";

/**
 * Phase 18 -- Home Page redesign, Part 1 of the UX brief this pass
 * addresses. Reordered around "what should I do next" rather than "here's
 * everything at once": Continue Practice + Daily Challenge (the latter had
 * a real backend since Phase 6 with zero frontend -- see
 * `daily-challenge-card.tsx`) now lead, immediately below the greeting.
 * Stats and the trend chart follow as supporting context, not the opener.
 *
 * One thing this pass deliberately did NOT do: treat "Upload a PDF" as
 * something that was dominating the page before this change. It was
 * already a single small header button, not a hero section -- see this
 * phase's design-review note in `PROJECT_STATE.md` for the fuller
 * critique. What *did* move: the button is no longer the first
 * call-to-action a user's eye lands on (it now sits beside Recent PDFs,
 * where the "advanced feature, not the headline" framing the brief asked
 * for actually reads as true rather than performed).
 */
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Welcome back, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's where your placement prep stands today.
        </p>
      </div>

      {/* Recommended actions -- what to do next, front and center. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ContinuePracticeCard />
        <DailyChallengeCard />
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

      <PracticeTrendChart />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <UpcomingCompaniesCard />
        <div className="flex flex-col gap-3">
          <RecentPdfsCard />
          {/* Upload lives here now, not the page header -- an advanced,
              secondary action next to the list it populates, per the
              brief's own framing (see this file's docstring above). */}
          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link to="/pdfs">
              <Upload className="size-4" />
              Upload a PDF
            </Link>
          </Button>
        </div>
        <RecentActivityCard />
      </div>
    </div>
  );
}
