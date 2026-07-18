import { toast } from "sonner";
import { Inbox } from "lucide-react";
import type { QuestionAuthoringInput } from "@placeprep/shared";
import { QuestionAuthoringForm } from "@/components/questions/question-authoring-form";
import { useMySubmissions, useSubmitQuestion } from "@/hooks/use-question-authoring";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/format";
import { ApiError } from "@/lib/api-client";

const STATUS_VARIANT = {
  "pending-review": "warning",
  approved: "correct",
  rejected: "incorrect",
  draft: "neutral",
} as const;

function MySubmissions() {
  const { data, isLoading } = useMySubmissions();
  const submissions = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>My submissions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && submissions.length === 0 && (
          <EmptyState icon={Inbox} title="No submissions yet" description="Questions you submit show up here with their review status." />
        )}
        {submissions.map((q) => (
          <div key={q.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <p className="line-clamp-2 text-sm text-foreground">{q.text}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[q.status as keyof typeof STATUS_VARIANT] ?? "neutral"} className="capitalize">
                {q.status.replace("-", " ")}
              </Badge>
              <DifficultyBadge difficulty={q.difficulty} />
              <span className="text-xs text-muted-foreground">{formatRelativeTime(q.createdAt)}</span>
            </div>
            {q.status === "rejected" && q.rejectionReason && (
              <p className="text-xs text-incorrect-500">Reviewer note: {q.rejectionReason}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SubmitQuestionPage() {
  const submit = useSubmitQuestion();

  const handleSubmit = (input: QuestionAuthoringInput) => {
    submit.mutate(input, {
      onSuccess: () => toast.success("Thanks! An admin will review it before it's added to the bank."),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't submit this question."),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Submit a Question</h1>
        <p className="text-sm text-muted-foreground">
          Know a good placement question? Add it here -- an admin reviews every submission before it joins the
          Question Bank. You'll never publish directly.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>New question</CardTitle>
          </CardHeader>
          <CardContent>
            <QuestionAuthoringForm submitLabel="Submit for review" submitting={submit.isPending} onSubmit={handleSubmit} />
          </CardContent>
        </Card>

        <MySubmissions />
      </div>
    </div>
  );
}
