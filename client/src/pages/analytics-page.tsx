import * as React from "react";
import { BarChart3, Building2, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQuizAttempts } from "@/hooks/use-quiz-attempts";
import { useQuestions } from "@/hooks/use-questions";
import { useCompanies } from "@/hooks/use-companies";
import { formatPercent } from "@/lib/format";

interface TopicStat {
  topic: string;
  attempted: number;
  correct: number;
  accuracy: number;
}

const MIN_ATTEMPTS_FOR_SIGNAL = 3;

/**
 * Module 7 — Analytics. Everything here is derived client-side from the real
 * quiz_attempts + questions data (no separate analytics backend/materialized
 * view yet — see PROJECT_STATE.md for why that's a reasonable Phase 6
 * follow-up rather than a gap in this pass: the source data didn't exist
 * before this sprint, so there was nothing to aggregate).
 */
export function AnalyticsPage() {
  const { data: attemptData, isLoading: attemptsLoading } = useQuizAttempts();
  const { data: questionData, isLoading: questionsLoading } = useQuestions();
  const { data: companyData } = useCompanies();

  const isLoading = attemptsLoading || questionsLoading;
  const completedAttempts = (attemptData?.items ?? []).filter((a) => a.status === "completed");
  const questionById = React.useMemo(
    () => new Map((questionData?.items ?? []).map((q) => [q.id, q])),
    [questionData],
  );

  const allResponses = completedAttempts.flatMap((a) => a.responses);
  const answeredResponses = allResponses.filter((r) => !r.wasSkipped);
  const totalCorrect = answeredResponses.filter((r) => r.isCorrect).length;
  const accuracy = answeredResponses.length > 0 ? (totalCorrect / answeredResponses.length) * 100 : 0;
  const averageScore =
    completedAttempts.length > 0
      ? completedAttempts.reduce((sum, a) => sum + a.score, 0) / completedAttempts.length
      : 0;
  const questionsSolved = new Set(answeredResponses.filter((r) => r.isCorrect).map((r) => r.questionId)).size;

  const topicStats = React.useMemo(() => {
    const map = new Map<string, TopicStat>();
    for (const response of answeredResponses) {
      const question = questionById.get(response.questionId);
      if (!question?.topic) continue;
      const entry = map.get(question.topic) ?? { topic: question.topic, attempted: 0, correct: 0, accuracy: 0 };
      entry.attempted += 1;
      if (response.isCorrect) entry.correct += 1;
      map.set(question.topic, entry);
    }
    return Array.from(map.values())
      .map((t) => ({ ...t, accuracy: t.attempted > 0 ? (t.correct / t.attempted) * 100 : 0 }))
      .filter((t) => t.attempted >= MIN_ATTEMPTS_FOR_SIGNAL);
  }, [answeredResponses, questionById]);

  const strongTopics = [...topicStats].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);
  const weakTopics = [...topicStats].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);

  const companyCoverage = React.useMemo(() => {
    const attemptedByCompany = new Map<string, Set<string>>();
    for (const response of answeredResponses) {
      const question = questionById.get(response.questionId);
      if (!question?.companyId) continue;
      const set = attemptedByCompany.get(question.companyId) ?? new Set<string>();
      set.add(response.questionId);
      attemptedByCompany.set(question.companyId, set);
    }
    return (companyData?.items ?? [])
      .filter((c) => c.questionCount > 0)
      .map((c) => ({
        name: c.name,
        attempted: attemptedByCompany.get(c.id)?.size ?? 0,
        total: c.questionCount,
        coverage: c.questionCount > 0 ? Math.round(((attemptedByCompany.get(c.id)?.size ?? 0) / c.questionCount) * 100) : 0,
      }))
      .sort((a, b) => b.coverage - a.coverage);
  }, [answeredResponses, questionById, companyData]);

  const chartData = topicStats
    .sort((a, b) => b.attempted - a.attempted)
    .slice(0, 8)
    .map((t) => ({ topic: t.topic, accuracy: Math.round(t.accuracy) }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">Real numbers from your completed quiz attempts.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : completedAttempts.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics yet"
          description="Complete a quiz to start seeing your accuracy, weak topics, and company coverage here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Accuracy" value={formatPercent(accuracy)} icon={Target} />
            <StatCard label="Average score" value={formatPercent(averageScore)} icon={BarChart3} />
            <StatCard label="Questions solved" value={questionsSolved} icon={TrendingUp} />
            <StatCard label="Quizzes completed" value={completedAttempts.length} icon={Building2} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Accuracy by topic</CardTitle>
              <CardDescription>Topics with at least {MIN_ATTEMPTS_FOR_SIGNAL} answered questions</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {chartData.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Not enough data yet"
                  description={`Answer at least ${MIN_ATTEMPTS_FOR_SIGNAL} questions in a topic to see it here.`}
                  className="h-full border-none py-0"
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
                    <XAxis dataKey="topic" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--surface-raised))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="accuracy" fill="#6e56cf" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-correct-600 dark:text-correct-500" />
                  Strong topics
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {strongTopics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not enough data yet.</p>
                ) : (
                  strongTopics.map((t) => (
                    <div key={t.topic} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{t.topic}</span>
                      <Badge variant="correct">{formatPercent(t.accuracy)}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="size-4 text-incorrect-600 dark:text-incorrect-500" />
                  Weak topics
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {weakTopics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not enough data yet.</p>
                ) : (
                  weakTopics.map((t) => (
                    <div key={t.topic} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{t.topic}</span>
                      <Badge variant="incorrect">{formatPercent(t.accuracy)}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Company coverage</CardTitle>
              <CardDescription>How much of each company's question set you've attempted</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {companyCoverage.length === 0 ? (
                <p className="text-sm text-muted-foreground">No companies with questions yet.</p>
              ) : (
                companyCoverage.slice(0, 8).map((c) => (
                  <div key={c.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.attempted}/{c.total} · {c.coverage}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                      <div className="h-full bg-accent-600" style={{ width: `${c.coverage}%` }} />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
