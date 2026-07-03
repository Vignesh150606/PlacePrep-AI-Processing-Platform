import { useParams } from "@tanstack/react-router";
import { Building2, ExternalLink, MessageSquare, ThumbsUp } from "lucide-react";
import { getCompanyBySlug } from "@/mocks/companies";
import { getQuestionsByCompany } from "@/mocks/questions";
import { mockInterviewExperiences } from "@/mocks/interview-experiences";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/questions/question-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { formatDate } from "@/lib/format";

export function CompanyDetailPage() {
  const { slug } = useParams({ from: "/app-layout/companies/$slug" });
  const company = getCompanyBySlug(slug);
  const { isBookmarked, toggle } = useBookmarks();

  if (!company) {
    return (
      <ErrorState
        title="Company not found"
        description="This company page doesn't exist or may have been removed."
      />
    );
  }

  const questions = getQuestionsByCompany(company.id);
  const experiences = mockInterviewExperiences.filter((e) => e.companyId === company.id);

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
              <p className="text-sm text-muted-foreground">{company.industry}</p>
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

      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{company.description}</p>

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
