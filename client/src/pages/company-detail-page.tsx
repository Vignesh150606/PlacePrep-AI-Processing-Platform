import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Building2, ExternalLink, MessageSquare } from "lucide-react";
import { useCompany } from "@/hooks/use-companies";
import { useQuestions } from "@/hooks/use-questions";
import { useInterviewExperiences } from "@/hooks/use-interview-experiences";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/components/questions/question-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useIsAdmin } from "@/hooks/use-profile";
import { ExperienceCard, SubmissionDialog } from "@/pages/interview-experiences-page";
import type { InterviewExperience } from "@placeprep/shared";

export function CompanyDetailPage() {
  const { slug } = useParams({ from: "/app-layout/companies/$slug" });
  const { data: company, isLoading, isError, refetch } = useCompany(slug);
  const { data: questionData } = useQuestions();
  const { isBookmarked, toggle } = useBookmarks();
  const isAdmin = useIsAdmin();
  const [editingExperience, setEditingExperience] = useState<InterviewExperience | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Phase 9: real backend, filtered to this company. Previously this tab
  // showed clearly-labeled sample data since there was no database table
  // at all yet — see PROJECT_STATE.md's Phase 9 entry.
  const { data: experienceData } = useInterviewExperiences({ companyId: company?.id });
  const experiences = experienceData?.items ?? [];

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
            <EmptyState
              icon={MessageSquare}
              title="No interview experiences yet"
              description="Be the first to share your experience with this company."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {experiences.map((experience) => (
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
      </Tabs>

      <SubmissionDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editingExperience} />
    </div>
  );
}
