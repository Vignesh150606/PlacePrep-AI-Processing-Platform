import * as React from "react";
import { useParams } from "@tanstack/react-router";
import {
  Bookmark,
  Building2,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  FileStack,
  HelpCircle,
  Layers,
  MessageSquare,
  Network,
} from "lucide-react";
import type { DifficultyLevel, InterviewExperience } from "@placeprep/shared";
import { useCompany, useCompanies } from "@/hooks/use-companies";
import { useQuestions } from "@/hooks/use-questions";
import { useInterviewExperiences } from "@/hooks/use-interview-experiences";
import { usePlacementEvents } from "@/hooks/use-calendar";
import { usePdfs } from "@/hooks/use-pdfs";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useIsAdmin } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { QuestionCard } from "@/components/questions/question-card";
import { CompanyCard } from "@/components/companies/company-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ExperienceCard, SubmissionDialog } from "@/pages/interview-experiences-page";
import { EventRow } from "@/pages/placement-calendar-page";
import { ROUND_TYPE_LABELS, OUTCOME_VARIANT } from "@/lib/interview-labels";
import { formatBytes, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIER_LABEL: Record<string, string> = {
  dream: "Dream",
  "super-dream": "Super Dream",
  core: "Core",
  "mass-recruiter": "Mass Recruiter",
};

// Mirrors company-card.tsx's TIER_VARIANT exactly -- same tier should
// render the same color everywhere in the app.
const TIER_VARIANT: Record<string, "accent" | "warning" | "neutral"> = {
  dream: "accent",
  "super-dream": "accent",
  core: "warning",
  "mass-recruiter": "neutral",
};

const OUTCOME_LABEL: Record<string, string> = {
  selected: "Selected",
  rejected: "Rejected",
  "in-progress": "In progress",
  withdrawn: "Withdrawn",
};

/** Same "count + percent bar" idiom analytics-page.tsx already uses for
 * company coverage -- reused here instead of pulling in a chart for what's
 * just a handful of categorical proportions. */
function DistributionBar({
  label,
  count,
  pct,
  barClassName,
}: {
  label: React.ReactNode;
  count: number;
  pct: number;
  barClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          {count} · {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div className={cn("h-full bg-accent-600", barClassName)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function difficultyDistribution(levels: DifficultyLevel[]) {
  const counts: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };
  for (const l of levels) counts[l] += 1;
  const total = levels.length;
  return (["easy", "medium", "hard"] as DifficultyLevel[]).map((level) => ({
    level,
    count: counts[level],
    pct: total > 0 ? (counts[level] / total) * 100 : 0,
  }));
}

const DIFFICULTY_BAR_CLASS: Record<DifficultyLevel, string> = {
  easy: "bg-correct-600",
  medium: "bg-warning-500",
  hard: "bg-incorrect-600",
};

/**
 * Phase 6A -- Company Intelligence Hub. Every section below is either the
 * existing Questions/Experiences tabs unchanged, or a NEW section derived
 * client-side from data an existing endpoint already returns (topics from
 * `question.topic` + `experience.keyTopics`, eligibility/events from
 * `/calendar?company_id=`, resources from `/pdfs`, difficulty/analytics/FAQ
 * from the already-fetched questions & experiences). The only backend
 * change this module needed at all was letting a company itself be
 * bookmarked (migration 0011) -- see PROJECT_STATE.md for the full
 * per-section reuse breakdown.
 */
export function CompanyDetailPage() {
  const { slug } = useParams({ from: "/app-layout/companies/$slug" });
  const { data: company, isLoading, isError, refetch } = useCompany(slug);
  const { data: questionData } = useQuestions();
  const { data: companiesData } = useCompanies();
  const { isBookmarked, toggle } = useBookmarks();
  const isAdmin = useIsAdmin();
  const [editingExperience, setEditingExperience] = React.useState<InterviewExperience | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Phase 9: real backend, filtered to this company.
  const { data: experienceData } = useInterviewExperiences({ companyId: company?.id });
  const experiences = React.useMemo(() => experienceData?.items ?? [], [experienceData]);
  const approvedExperiences = React.useMemo(
    () => experiences.filter((e) => e.status === "approved"),
    [experiences],
  );

  // Phase 8's Placement Calendar, filtered to this company -- same hook the
  // Calendar page itself uses, not a parallel fetch.
  const { data: eventData } = usePlacementEvents({ companyId: company?.id });
  const events = React.useMemo(() => eventData?.items ?? [], [eventData]);
  const upcomingEvents = React.useMemo(
    () => events.filter((e) => e.status !== "completed" && e.status !== "cancelled"),
    [events],
  );

  // PDF Library, filtered to this company client-side -- same `usePdfs()`
  // the general Library page calls (React Query cache hit if it's already
  // been visited this session), same "no status filter" default it uses
  // for its main tab, narrowed here to "completed" since a pending/failed
  // upload isn't a usable prep resource yet.
  const { data: pdfData } = usePdfs();
  const resources = React.useMemo(
    () =>
      (pdfData?.items ?? []).filter(
        (p) => p.companyId === company?.id && p.processingStatus === "completed",
      ),
    [pdfData, company?.id],
  );

  const questions = React.useMemo(
    () => (questionData?.items ?? []).filter((q) => q.companyId === company?.id),
    [questionData, company?.id],
  );

  // --- Most common topics: question.topic (Question Bank) + experience
  // .keyTopics (Interview Experiences), combined into one frequency count.
  const topicCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions) {
      if (q.topic) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
    }
    for (const e of approvedExperiences) {
      for (const t of e.keyTopics ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [questions, approvedExperiences]);

  // --- Outcome distribution (selection rate, from reported experience outcomes).
  const outcomeCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of approvedExperiences) counts.set(e.outcome, (counts.get(e.outcome) ?? 0) + 1);
    const total = approvedExperiences.length;
    return [...counts.entries()]
      .map(([outcome, count]) => ({ outcome, count, pct: total > 0 ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [approvedExperiences]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !company) {
    return (
      <ErrorState
        title="Company not found"
        description="This company page doesn't exist or may have been removed."
        onRetry={isError ? () => refetch() : undefined}
      />
    );
  }

  // --- Eligibility: nearest upcoming event that actually has eligibility
  // text set, rather than a separate company-level field -- a placement
  // drive's eligibility is genuinely per-drive, not a fixed company
  // attribute, and this is real data already being fetched above.
  const eligibilityEvent = upcomingEvents.find((e) => e.eligibility);

  // --- Difficulty indicators (Question Bank) + outcome distribution.
  const questionDifficulty = difficultyDistribution(questions.map((q) => q.difficulty));
  const experienceDifficulty = difficultyDistribution(approvedExperiences.map((e) => e.difficulty));
  const decidedOutcomes = approvedExperiences.filter(
    (e) => e.outcome === "selected" || e.outcome === "rejected",
  );
  const selectionRate =
    decidedOutcomes.length > 0
      ? (decidedOutcomes.filter((e) => e.outcome === "selected").length / decidedOutcomes.length) * 100
      : null;
  const avgRounds =
    approvedExperiences.length > 0
      ? approvedExperiences.reduce((sum, e) => sum + e.rounds.length, 0) / approvedExperiences.length
      : null;
  const commonRoundTypes = [
    ...new Set(approvedExperiences.flatMap((e) => e.rounds.map((r) => r.type))),
  ];

  // --- Related companies: same industry weighted over same tier, self excluded.
  const relatedCompanies = (companiesData?.items ?? [])
    .filter((c) => c.id !== company.id)
    .map((c) => ({
      company: c,
      score: (c.industry && c.industry === company.industry ? 2 : 0) + (c.tier === company.tier ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.company);

  // --- FAQs: every entry derived from real data above; nothing shown
  // without a real number/fact behind it.
  const faqs: { question: string; answer: string }[] = [];
  if (company.roles.length > 0) {
    faqs.push({
      question: `What roles does ${company.name} hire for?`,
      answer: company.roles.join(", ") + ".",
    });
  }
  if (company.averagePackageLpa) {
    faqs.push({
      question: `What's the average package at ${company.name}?`,
      answer: `Around ₹${company.averagePackageLpa} LPA, based on the placement data recorded for this company.`,
    });
  }
  if (commonRoundTypes.length > 0) {
    faqs.push({
      question: `What does the interview process look like?`,
      answer: `Based on ${approvedExperiences.length} reported experience${approvedExperiences.length === 1 ? "" : "s"}, rounds commonly include: ${commonRoundTypes.map((t) => ROUND_TYPE_LABELS[t]).join(", ")}.${avgRounds ? ` Most candidates go through around ${Math.round(avgRounds)} round${Math.round(avgRounds) === 1 ? "" : "s"}.` : ""}`,
    });
  }
  if (selectionRate !== null) {
    faqs.push({
      question: `What's the selection rate at ${company.name}?`,
      answer: `Of ${decidedOutcomes.length} reported outcome${decidedOutcomes.length === 1 ? "" : "s"}, ${formatPercent(selectionRate)} resulted in an offer.`,
    });
  }
  if (topicCounts.length > 0) {
    faqs.push({
      question: `What topics should I prepare?`,
      answer: `The most frequently reported topics are ${topicCounts.slice(0, 5).map(([t]) => t).join(", ")}.`,
    });
  }
  if (eligibilityEvent?.eligibility) {
    faqs.push({
      question: `What's the eligibility criteria?`,
      answer: eligibilityEvent.eligibility,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface text-muted-foreground">
              <Building2 className="size-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{company.name}</h1>
                <Badge variant={TIER_VARIANT[company.tier] ?? "neutral"}>
                  {TIER_LABEL[company.tier] ?? company.tier}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{company.industry || "Industry not set"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {company.roles.map((role) => (
                  <Badge key={role} variant="neutral">{role}</Badge>
                ))}
                {company.averagePackageLpa && (
                  <Badge variant="accent">Avg {company.averagePackageLpa} LPA</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={isBookmarked(company.id) ? "Remove bookmark" : "Bookmark company"}
              aria-pressed={isBookmarked(company.id)}
              onClick={() => toggle(company.id, "company")}
            >
              <Bookmark
                className={cn("size-4", isBookmarked(company.id) && "fill-accent-600 text-accent-600")}
              />
            </Button>
            {company.website && (
              <Button asChild variant="secondary" size="sm">
                <a href={company.website} target="_blank" rel="noreferrer">
                  Visit website
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {company.description && (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{company.description}</p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Questions" value={questions.length} icon={FileStack} />
        <StatCard label="Interview experiences" value={approvedExperiences.length} icon={MessageSquare} />
        <StatCard
          label="Selection rate"
          value={selectionRate !== null ? formatPercent(selectionRate) : "—"}
          icon={BarChart3}
        />
        <StatCard label="Upcoming events" value={upcomingEvents.length} icon={CalendarDays} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-accent-600 dark:text-accent-400" />
              Eligibility criteria
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {eligibilityEvent?.eligibility ? (
              <p className="text-sm text-muted-foreground">{eligibilityEvent.eligibility}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No eligibility criteria published yet for an upcoming drive.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-accent-600 dark:text-accent-400" />
              Upcoming placement events
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events scheduled for this company yet.</p>
            ) : (
              upcomingEvents
                .slice(0, 3)
                .map((event) => (
                  <EventRow key={event.id} event={event} isAdmin={false} onEdit={() => {}} onDelete={() => {}} />
                ))
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
          <TabsTrigger value="experiences">Experiences ({approvedExperiences.length})</TabsTrigger>
          <TabsTrigger value="topics">Topics ({topicCounts.length})</TabsTrigger>
          <TabsTrigger value="resources">Resources ({resources.length})</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="questions">
          {questions.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No questions yet"
              description="Be the first to upload a placement PDF for this company."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {questions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  companyName={company.name}
                  isBookmarked={isBookmarked(question.id)}
                  onToggleBookmark={(id) => toggle(id, "question")}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="experiences">
          {approvedExperiences.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No interview experiences yet"
              description="Be the first to share your experience with this company."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {approvedExperiences.map((experience) => (
                <ExperienceCard
                  key={experience.id}
                  experience={experience}
                  companyName={company.name}
                  isAdmin={isAdmin}
                  onEdit={() => {
                    setEditingExperience(experience);
                    setDialogOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="topics">
          {topicCounts.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No topics yet"
              description="Topics show up here once questions or interview experiences mention them."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {topicCounts.map(([topic, count]) => (
                <Badge key={topic} variant="accent" className="text-sm">
                  {topic} <span className="text-accent-700/70 dark:text-accent-400/70">· {count}</span>
                </Badge>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="resources">
          {resources.length === 0 ? (
            <EmptyState
              icon={FileStack}
              title="No preparation resources yet"
              description="PDFs uploaded and processed for this company will show up here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {resources.map((pdf) => (
                <Card key={pdf.id} className="flex flex-col gap-2 p-4">
                  <p className="font-medium text-foreground">{pdf.title || pdf.fileName}</p>
                  {pdf.description && <p className="text-sm text-muted-foreground">{pdf.description}</p>}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {formatBytes(pdf.fileSizeBytes)} · {pdf.extractedQuestionCount} questions extracted
                    </span>
                    {pdf.storageUrl && (
                      <Button asChild variant="ghost" size="sm">
                        <a href={pdf.storageUrl} target="_blank" rel="noreferrer">
                          Open <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics">
          {questions.length === 0 && approvedExperiences.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Not enough data yet"
              description="Analytics for this company will appear once there are questions or interview experiences."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Question Bank difficulty</CardTitle>
                  <CardDescription>Across {questions.length} question{questions.length === 1 ? "" : "s"}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-0">
                  {questions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No questions yet.</p>
                  ) : (
                    questionDifficulty.map((d) => (
                      <DistributionBar
                        key={d.level}
                        label={<DifficultyBadge difficulty={d.level} />}
                        count={d.count}
                        pct={d.pct}
                        barClassName={DIFFICULTY_BAR_CLASS[d.level]}
                      />
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Reported interview difficulty</CardTitle>
                  <CardDescription>
                    Across {approvedExperiences.length} experience{approvedExperiences.length === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-0">
                  {approvedExperiences.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No interview experiences yet.</p>
                  ) : (
                    experienceDifficulty.map((d) => (
                      <DistributionBar
                        key={d.level}
                        label={<DifficultyBadge difficulty={d.level} />}
                        count={d.count}
                        pct={d.pct}
                        barClassName={DIFFICULTY_BAR_CLASS[d.level]}
                      />
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Outcomes</CardTitle>
                  <CardDescription>What happened in reported interview experiences</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-0">
                  {outcomeCounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No interview experiences yet.</p>
                  ) : (
                    outcomeCounts.map((o) => (
                      <DistributionBar
                        key={o.outcome}
                        label={
                          <Badge variant={OUTCOME_VARIANT[o.outcome] ?? "neutral"}>
                            {OUTCOME_LABEL[o.outcome] ?? o.outcome}
                          </Badge>
                        }
                        count={o.count}
                        pct={o.pct}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {faqs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="size-4 text-accent-600 dark:text-accent-400" />
              Frequently asked questions
            </CardTitle>
            <CardDescription>Answers derived from the data reported for {company.name}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {faqs.map((faq) => (
              <details key={faq.question} className="group rounded-lg border border-border-subtle px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:content-none">
                  {faq.question}
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </CardContent>
        </Card>
      )}

      {relatedCompanies.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Network className="size-4 text-accent-600 dark:text-accent-400" />
            Related companies
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedCompanies.map((c) => (
              <CompanyCard key={c.id} company={c} />
            ))}
          </div>
        </div>
      )}

      <SubmissionDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editingExperience} />
    </div>
  );
}
