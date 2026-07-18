import { toast } from "sonner";
import { FileEdit } from "lucide-react";
import type { QuestionAuthoringInput } from "@placeprep/shared";
import { QuestionAuthoringForm } from "@/components/questions/question-authoring-form";
import { useCreateManualQuestion, useMyDrafts, usePublishDraftQuestion } from "@/hooks/use-question-authoring";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DifficultyBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/format";
import { ApiError } from "@/lib/api-client";

function DraftManagement() {
  const { data, isLoading } = useMyDrafts();
  const publish = usePublishDraftQuestion();
  const drafts = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft management</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && drafts.length === 0 && (
          <EmptyState icon={FileEdit} title="No drafts yet" description="Questions you save without publishing show up here." />
        )}
        {drafts.map((d) => (
          <div key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <div className="flex flex-col gap-1">
              <p className="line-clamp-2 text-sm text-foreground">{d.text}</p>
              <div className="flex items-center gap-2">
                <DifficultyBadge difficulty={d.difficulty} />
                <span className="text-xs text-muted-foreground">{formatRelativeTime(d.createdAt)}</span>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={publish.isPending}
              onClick={() =>
                publish.mutate(d.id, {
                  onSuccess: () => toast.success("Draft published."),
                  onError: (err) => toast.error(err instanceof ApiError ? err.message : "Publish failed."),
                })
              }
            >
              Publish
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AdminQuestionBuilderPage() {
  const create = useCreateManualQuestion();

  const handlePublish = (input: QuestionAuthoringInput) => {
    create.mutate(
      { ...input, publish: true },
      {
        onSuccess: () => toast.success("Question published to the bank."),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't publish this question."),
      },
    );
  };

  const handleSaveDraft = (input: QuestionAuthoringInput) => {
    create.mutate(
      { ...input, publish: false },
      {
        onSuccess: () => toast.success("Draft saved."),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this draft."),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Question Builder</h1>
        <p className="text-sm text-muted-foreground">
          Manually add a question to the bank. Published questions appear immediately in the Question Bank, Quiz
          Engine, and Company Hub, exactly like an AI-extracted one.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>New question</CardTitle>
          </CardHeader>
          <CardContent>
            <QuestionAuthoringForm
              submitLabel="Publish now"
              submitting={create.isPending}
              onSubmit={handlePublish}
              secondaryAction={{ label: "Save as draft", onSubmit: handleSaveDraft, submitting: create.isPending }}
              helperText="Publishing makes this question live immediately -- no separate review step, since you're the reviewer."
            />
          </CardContent>
        </Card>

        <DraftManagement />
      </div>
    </div>
  );
}
