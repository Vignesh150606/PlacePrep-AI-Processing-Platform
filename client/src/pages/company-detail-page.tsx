import { useParams } from "@tanstack/react-router";
import { Building2, ExternalLink, Info, MessageSquare, ThumbsUp } from "lucide-react";
import { useCompany } from "@/hooks/use-companies";
import { useQuestions } from "@/hooks/use-questions";
import { mockCompanies } from "@/mocks/companies";
import { mockInterviewExperiences } from "@/mocks/interview-experiences";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/questions/question-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { formatDate } from "@/lib/format";

export function CompanyDetailPage() {
  const { slug } = useParams({ from: "/app-layout/companies/$slug" });
  const { data: company, isLoading, isError, refetch } = useCompany(slug);
  const { data: questionData } = useQuestions();
  const { isBookmarked, toggle } = useBookmarks();

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

  const questions = (questionData?.items ?? []).filter((q) => q.companyId === company.id);

  // Interview Experiences has no backend yet (Sprint 5 — see
  // PROJECT_STATE.md). Rather than fabricate submissions for a real
  // company, we only ever show clearly-labeled sample data, matched by
  // name against the old demo dataset so it stays plausible for the
  // handful of companies the demo set covers.
  const demoMatch = mockCompanies.find((c) => c.name.toLowerCase() === company.name.toLowerCase());
  const experiences = demoMatch
    ? mockInterviewExperiences.filter((e) => e.companyId === demoMatch.id)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface text-muted-foreground">
              <Building2 className="size-7" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{company.name}</h1>
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
          {company.website && (
            <Button asChild variant="secondary" size="sm">
              <a href={company.website} target="_blank" rel="noreferrer">
                Visit website
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {company.description && (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{company.description}</p>
      )}

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
          <TabsTrigger value="experiences">Interview Experiences ({experiences.length})</TabsTrigger>
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
          {experiences.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No interview experiences yet" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0" />
                Sample data — interview experience submissions aren't backed by a database yet.
              </div>
              {experiences.map((experience) => (
                <Card key={experience.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {experience.role} · Class of {experience.graduationYear}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {experience.isAnonymous ? "Posted anonymously" : "Posted by a verified student"}
                        {" · "}
                        {formatDate(experience.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <DifficultyBadge difficulty={experience.difficulty} />
                      <Badge variant={experience.outcome === "selected" ? "correct" : "neutral"} className="capitalize">
                        {experience.outcome}
                      </Badge>
                    </div>
                  </div>

                  <ol className="mt-4 flex flex-col gap-2 border-l border-border-subtle pl-4">
                    {experience.rounds.map((round) => (
                      <li key={round.id}>
                        <p className="text-sm font-medium text-foreground">{round.title}</p>
                        <p className="text-sm text-muted-foreground">{round.description}</p>
                      </li>
                    ))}
                  </ol>

                  <p className="mt-4 rounded-lg bg-surface p-3 text-sm text-foreground">
                    {experience.overallTips}
                  </p>

                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ThumbsUp className="size-3.5" />
                    {experience.upvoteCount} found this helpful
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
