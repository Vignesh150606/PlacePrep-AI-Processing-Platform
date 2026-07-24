import * as React from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuestions } from "@/hooks/use-questions";
import { useCompanies } from "@/hooks/use-companies";
import { useSetWrongAnswerResolved, useWrongAnswers } from "@/hooks/use-wrong-answers";
import { QuestionCard } from "@/components/questions/question-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SlidersHorizontal } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";

/**
 * Module 4 — Wrong Answer Notebook. Backed by the same quiz_attempts data
 * that powers Quiz Submission: any response where isCorrect is false and
 * wasSkipped is false gets aggregated server-side into `/quizzes/wrong-answers`
 * (see server/app/api/v1/endpoints/quizzes.py). "Retry" sends the student to
 * the Quiz page's "Wrong Answers" mode; "Mastered" and "Delete" both resolve
 * the entry (see the hook's comment for why they share one field).
 */
export function WrongAnswersPage() {
  const { data: questionData, isLoading: questionsLoading, isError, refetch } = useQuestions();
  const { data: companyData } = useCompanies();
  const { data: wrongAnswerData, isLoading: wrongLoading } = useWrongAnswers();
  const setResolved = useSetWrongAnswerResolved();

  const [selectedSubjects, setSelectedSubjects] = React.useState<string[]>([]);
  const [showResolved, setShowResolved] = React.useState(false);

  const questionById = new Map((questionData?.items ?? []).map((q) => [q.id, q]));
  const companyNameById = new Map((companyData?.items ?? []).map((c) => [c.id, c.name]));

  const entries = (wrongAnswerData?.items ?? []).filter((e) => showResolved || !e.resolved);
  const availableSubjects = Array.from(
    new Set(entries.map((e) => questionById.get(e.questionId)?.subject).filter((s): s is string => Boolean(s))),
  ).sort();

  const visibleEntries = entries.filter((e) => {
    if (selectedSubjects.length === 0) return true;
    const subject = questionById.get(e.questionId)?.subject;
    return subject ? selectedSubjects.includes(subject) : false;
  });

  const isLoading = questionsLoading || wrongLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Wrong Answer Notebook</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${visibleEntries.length} question${visibleEntries.length === 1 ? "" : "s"} to review.`}
          </p>
        </div>
        <div className="flex gap-2">
          {availableSubjects.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <SlidersHorizontal className="size-3.5" />
                  Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Subject</DropdownMenuLabel>
                {availableSubjects.map((subject) => (
                  <DropdownMenuCheckboxItem
                    key={subject}
                    checked={selectedSubjects.includes(subject)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() =>
                      setSelectedSubjects((prev) =>
                        prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject],
                      )
                    }
                  >
                    {subject}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuCheckboxItem
                  checked={showResolved}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => setShowResolved((v) => !v)}
                >
                  Show mastered/removed
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {visibleEntries.length > 0 && (
            <Button asChild size="sm">
              {/* FIX (Sprint 1A): was Link to="/quiz" with no mode, so the
                  config form always defaulted to "mixed" — now lands
                  directly in the Wrong Answers quiz mode. */}
              <Link to="/quiz" search={{ mode: "wrong-answers" }}>
                <RotateCcw className="size-3.5" />
                Retry all
              </Link>
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load your wrong answers." onRetry={() => refetch()} />
      ) : visibleEntries.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={entries.length === 0 ? "Nothing to review — nice work" : "No entries match this filter"}
          description="Questions you get wrong in a quiz automatically land here for revision."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleEntries.map((entry) => {
            const question = questionById.get(entry.questionId);
            if (!question) return null;
            const selectedOptions = question.options.filter((o) => entry.lastSelectedOptionIds.includes(o.id));
            const correctOptions = question.options.filter((o) => o.isCorrect);
            return (
              <div key={entry.questionId} className="flex flex-col gap-2">
                <QuestionCard
                  question={question}
                  companyName={question.companyId ? companyNameById.get(question.companyId) : null}
                />
                {(selectedOptions.length > 0 || correctOptions.length > 0) && (
                  <div className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-xs">
                    {selectedOptions.length > 0 && (
                      <p className="text-incorrect-600 dark:text-incorrect-500">
                        Your answer: {selectedOptions.map((o) => `${o.label}. ${o.text}`).join(", ")}
                      </p>
                    )}
                    <p className="text-correct-600 dark:text-correct-500">
                      Correct answer: {correctOptions.map((o) => `${o.label}. ${o.text}`).join(", ")}
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    Missed {entry.timesWrong} time{entry.timesWrong === 1 ? "" : "s"} · last{" "}
                    {formatRelativeTime(entry.lastAttemptAt)}
                    <Badge variant={entry.resolved ? "correct" : "warning"}>
                      {entry.resolved ? "Reviewed" : "Needs review"}
                    </Badge>
                  </span>
                  {!entry.resolved ? (
                    <div className="flex gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setResolved.mutate(
                            { questionId: entry.questionId, resolved: true },
                            { onSuccess: () => toast.success("Marked as mastered.") },
                          )
                        }
                      >
                        <CheckCircle2 className="size-3.5" />
                        Mastered
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setResolved.mutate(
                            { questionId: entry.questionId, resolved: true },
                            { onSuccess: () => toast.success("Removed from notebook.") },
                          )
                        }
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setResolved.mutate({ questionId: entry.questionId, resolved: false })}
                    >
                      <XCircle className="size-3.5" />
                      Move back to notebook
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
