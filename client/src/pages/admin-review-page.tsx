import * as React from "react";
import { CheckCircle2, Pencil, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { DifficultyLevel, Question } from "@placeprep/shared";
import { usePendingReviewQuestions, useReviewQuestion } from "@/hooks/use-admin-questions";
import { useCompanies } from "@/hooks/use-companies";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const DIFFICULTIES: DifficultyLevel[] = ["easy", "medium", "hard"];

function EditQuestionDialog({
  question,
  open,
  onOpenChange,
}: {
  question: Question | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { update } = useReviewQuestion();
  const [text, setText] = React.useState("");
  const [explanation, setExplanation] = React.useState("");
  const [difficulty, setDifficulty] = React.useState<DifficultyLevel>("medium");

  React.useEffect(() => {
    if (question) {
      setText(question.text);
      setExplanation(question.correctExplanation ?? "");
      setDifficulty(question.difficulty);
    }
  }, [question]);

  if (!question) return null;

  function handleSave() {
    if (!question) return;
    update.mutate(
      { id: question.id, patch: { text, correctExplanation: explanation || null, difficulty } },
      {
        onSuccess: () => {
          toast.success("Question updated.");
          onOpenChange(false);
        },
        onError: () => toast.error("Couldn't save changes."),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit question</DialogTitle>
          <DialogDescription>Fix extraction mistakes before approving.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-text">Question text</Label>
            <textarea
              id="edit-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-explanation">Explanation</Label>
            <textarea
              id="edit-explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-difficulty">Difficulty</Label>
            <select
              id="edit-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              className="h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d} className="capitalize">
                  {d}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleSave} disabled={update.isPending} className="w-fit">
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SOURCE_FILTERS: Array<{ label: string; value: string | undefined }> = [
  { label: "All", value: undefined },
  { label: "Student submissions", value: "STUDENT_MANUAL" },
  { label: "Bulk import", value: "BULK_IMPORT" },
  { label: "Admin manual", value: "ADMIN_MANUAL" },
  { label: "AI extracted", value: "AI" },
];

const SOURCE_LABEL: Record<string, string> = {
  AI: "AI extracted",
  ADMIN_MANUAL: "Admin manual",
  STUDENT_MANUAL: "Student submission",
  BULK_IMPORT: "Bulk import",
};

/**
 * Module 8 — Admin Review. Approve/Reject/Edit/Delete for pending-review
 * questions (the ones the confidence gate in classification.py routed away
 * from the public bank). "Merge" is intentionally not built this pass — see
 * PROJECT_STATE.md.
 *
 * Phase 13 extended this into the "Student Question Queue" too, rather than
 * building a separate duplicate page for it -- a student-submitted question
 * is a `pending-review` question like any other, just with
 * `sourceType: "STUDENT_MANUAL"`. The source filter row below is the whole
 * of that "separate" surface.
 */
export function AdminReviewPage() {
  const [sourceType, setSourceType] = React.useState<string | undefined>(undefined);
  const { data, isLoading, isError, refetch } = usePendingReviewQuestions(sourceType);
  const { data: companyData } = useCompanies();
  const { setStatus, remove } = useReviewQuestion();
  const [editingQuestion, setEditingQuestion] = React.useState<Question | null>(null);

  const companyNameById = new Map((companyData?.items ?? []).map((c) => [c.id, c.name]));
  const questions = data?.items ?? [];

  function handleReject(question: Question) {
    const reason = window.prompt("Rejection reason (shown to the submitter if this is their own question):");
    if (!reason) return;
    setStatus.mutate(
      { id: question.id, status: "rejected", rejectionReason: reason },
      { onSuccess: () => toast.success("Rejected.") },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Review Queue</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${questions.length} question${questions.length === 1 ? "" : "s"} awaiting review.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SOURCE_FILTERS.map((f) => (
          <Button
            key={f.label}
            size="sm"
            variant={sourceType === f.value ? "primary" : "secondary"}
            onClick={() => setSourceType(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load the review queue." onRetry={() => refetch()} />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing to review"
          description="Extracted questions confident enough to publish automatically skip this queue."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map((question) => (
            <Card key={question.id} className="p-5">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="accent">{SOURCE_LABEL[question.sourceType] ?? question.sourceType}</Badge>
                  <DifficultyBadge difficulty={question.difficulty} />
                  {question.subject && <Badge variant="neutral">{question.subject}</Badge>}
                  {question.topic && <Badge variant="accent">{question.topic}</Badge>}
                  {question.companyId && (
                    <Badge variant="neutral">{companyNameById.get(question.companyId) ?? "Unknown company"}</Badge>
                  )}
                  {question.confidenceScore !== undefined && question.sourceType === "AI" && (
                    <Badge variant="warning">{Math.round(question.confidenceScore * 100)}% confidence</Badge>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground">{question.text}</p>
                <ul className="flex flex-col gap-1">
                  {question.options.map((option) => (
                    <li
                      key={option.id}
                      className={
                        option.isCorrect
                          ? "rounded-md border border-correct-500/30 bg-correct-500/5 px-3 py-1.5 text-sm text-correct-700 dark:text-correct-500"
                          : "rounded-md border border-border-subtle px-3 py-1.5 text-sm text-muted-foreground"
                      }
                    >
                      <span className="font-medium">{option.label}.</span> {option.text}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
                  <Button
                    size="sm"
                    onClick={() =>
                      setStatus.mutate(
                        { id: question.id, status: "approved" },
                        { onSuccess: () => toast.success("Approved — now visible in the Question Bank.") },
                      )
                    }
                    disabled={setStatus.isPending}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingQuestion(question)}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleReject(question)}
                    disabled={setStatus.isPending}
                  >
                    <XCircle className="size-3.5" />
                    Reject
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      remove.mutate(question.id, { onSuccess: () => toast.success("Question deleted.") })
                    }
                    disabled={remove.isPending}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <EditQuestionDialog
        question={editingQuestion}
        open={editingQuestion !== null}
        onOpenChange={(open) => !open && setEditingQuestion(null)}
      />
    </div>
  );
}
