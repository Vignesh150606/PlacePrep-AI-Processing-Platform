import * as React from "react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  DifficultyLevel,
  Question,
  QuestionBulkActionType,
  QuestionBulkUpdateInput,
  QuestionLifecycleStatus,
  QuestionSourceType,
} from "@placeprep/shared";
import {
  useAdminQuestions,
  useBulkQuestionAction,
  useBulkUpdateQuestions,
  useQuestionLifecycle,
  useReviewQuestion,
} from "@/hooks/use-admin-questions";
import { usePublishDraftQuestion } from "@/hooks/use-question-authoring";
import { useCompanies } from "@/hooks/use-companies";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { ExplanationSection } from "@/components/questions/explanation-section";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { formatRelativeTime } from "@/lib/format";

const PAGE_SIZE = 20;
const DIFFICULTIES: DifficultyLevel[] = ["easy", "medium", "hard"];
const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  const [solution, setSolution] = React.useState("");
  const [difficulty, setDifficulty] = React.useState<DifficultyLevel>("medium");

  React.useEffect(() => {
    if (question) {
      setText(question.text);
      setExplanation(question.correctExplanation ?? "");
      setSolution(question.solutionSteps ?? "");
      setDifficulty(question.difficulty);
    }
  }, [question]);

  if (!question) return null;

  function handleSave() {
    if (!question) return;
    update.mutate(
      {
        id: question.id,
        patch: { text, correctExplanation: explanation || null, solutionSteps: solution || null, difficulty },
      },
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
            <Label htmlFor="edit-solution">
              Full solution
              <span className="ml-1 font-normal text-muted-foreground">
                (bulk-imported "Solution:"/"Explanation:" text lands here)
              </span>
            </Label>
            <textarea
              id="edit-solution"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-difficulty">Difficulty</Label>
            <select
              id="edit-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              className={selectClass}
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

/** Feature 1's "Bulk Subject Update" / "Bulk Topic Update" / "Bulk Company
 * Update" / "Bulk Difficulty Update" / "Bulk Tags Update" -- one form, one
 * endpoint. Every field starts blank ("don't change"); only the ones the
 * admin actually fills in get sent. */
function BulkUpdateDialog({
  questionIds,
  open,
  onOpenChange,
}: {
  questionIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const bulkUpdate = useBulkUpdateQuestions();
  const [difficulty, setDifficulty] = React.useState<DifficultyLevel | "">("");
  const [subject, setSubject] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [addTags, setAddTags] = React.useState("");

  function reset() {
    setDifficulty("");
    setSubject("");
    setTopic("");
    setCompanyName("");
    setAddTags("");
  }

  function handleApply() {
    const input: QuestionBulkUpdateInput = { questionIds };
    if (difficulty) input.difficulty = difficulty;
    if (subject.trim()) input.subject = subject.trim();
    if (topic.trim()) input.topic = topic.trim();
    if (companyName.trim()) input.companyName = companyName.trim();
    const tags = addTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length) input.addTags = tags;

    if (!input.difficulty && !input.subject && !input.topic && !input.companyName && !input.addTags) {
      toast.error("Set at least one field to update.");
      return;
    }

    bulkUpdate.mutate(input, {
      onSuccess: (result) => {
        toast.success(
          `${result.succeeded.length} question(s) updated${result.failed.length ? `, ${result.failed.length} failed` : ""}.`,
        );
        reset();
        onOpenChange(false);
      },
      onError: () => toast.error("Bulk update failed."),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk edit {questionIds.length} question(s)</DialogTitle>
          <DialogDescription>Only the fields you set below are changed -- leave the rest blank.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-difficulty">Difficulty</Label>
            <select
              id="bulk-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel | "")}
              className={selectClass}
            >
              <option value="">Don't change</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d} className="capitalize">
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-subject">Subject</Label>
            <Input id="bulk-subject" placeholder="e.g. Data Structures" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-topic">Topic</Label>
            <Input id="bulk-topic" placeholder="e.g. Binary Trees" value={topic} onChange={(e) => setTopic(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Setting a topic without a subject keeps each question's current subject.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-company">Company</Label>
            <Input
              id="bulk-company"
              placeholder="e.g. Google"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-tags">Add tags (comma-separated)</Label>
            <Input id="bulk-tags" placeholder="e.g. recursion, arrays" value={addTags} onChange={(e) => setAddTags(e.target.value)} />
          </div>
          <Button onClick={handleApply} disabled={bulkUpdate.isPending} className="w-fit">
            Apply to {questionIds.length} question(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SOURCE_FILTERS: Array<{ label: string; value: QuestionSourceType | undefined }> = [
  { label: "All sources", value: undefined },
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

interface TabState {
  label: string;
  status: QuestionLifecycleStatus | "";
  deleted: boolean;
}

/** Feature 1's lifecycle diagram as tabs -- "Published" isn't its own tab
 * (it's "Approved" everywhere in this codebase, see migration 0016's
 * docstring), and "Restored" isn't a resting state (it's what
 * `restoreOne`/the Restore button DOES, landing a question back on
 * whichever of the tabs below its status already was). */
const TABS: TabState[] = [
  { label: "Pending review", status: "pending-review", deleted: false },
  { label: "Drafts", status: "draft", deleted: false },
  { label: "Approved", status: "approved", deleted: false },
  { label: "Archived", status: "archived", deleted: false },
  { label: "Rejected", status: "rejected", deleted: false },
  { label: "Deleted", status: "", deleted: true },
];

/**
 * Module 8 — Admin Review, expanded into Phase 15's full Question Lifecycle
 * Management + Question Bank Admin UX (Features 1 & 2). This used to be a
 * single pending-review queue; it's now every question, in every lifecycle
 * state, with multi-select + bulk actions + bulk field edits + soft
 * delete/restore/archive. "Merge duplicates" stays on the per-question
 * merge flow it already had (question_merge.py) -- not rebuilt here.
 *
 * Phase 13's "Student Question Queue" is still just the "Pending review"
 * tab filtered to `sourceType: STUDENT_MANUAL` via the source filter row,
 * same as before -- not a separate surface.
 */
export function AdminReviewPage() {
  const [tab, setTab] = React.useState<TabState>(TABS[0]);
  const [sourceType, setSourceType] = React.useState<QuestionSourceType | undefined>(undefined);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editingQuestion, setEditingQuestion] = React.useState<Question | null>(null);
  const [bulkEditing, setBulkEditing] = React.useState(false);

  // No shared debounce hook exists in this codebase yet (see
  // admin-dashboard-page.tsx's UsersTable for the same local pattern) --
  // stays local rather than introducing a new generic utility for two callers.
  React.useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = useAdminQuestions({
    status: tab.deleted ? undefined : tab.status,
    deleted: tab.deleted,
    sourceType,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const { data: companyData } = useCompanies();
  const { setStatus, remove } = useReviewQuestion();
  const { archive, unarchive, restore, permanentDelete } = useQuestionLifecycle();
  const publishDraft = usePublishDraftQuestion();
  const bulkAction = useBulkQuestionAction();

  const companyNameById = new Map((companyData?.items ?? []).map((c) => [c.id, c.name]));
  const questions = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function switchTab(next: TabState) {
    setTab(next);
    setSelected(new Set());
    setPage(1);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === questions.length ? new Set() : new Set(questions.map((q) => q.id))));
  }

  function handleReject(question: Question) {
    const reason = window.prompt("Rejection reason (shown to the submitter if this is their own question):");
    if (!reason) return;
    setStatus.mutate(
      { id: question.id, status: "rejected", rejectionReason: reason },
      { onSuccess: () => toast.success("Rejected.") },
    );
  }

  function handleDelete(question: Question) {
    if (!window.confirm("Delete this question? It can be restored from the Deleted tab.")) return;
    remove.mutate(question.id, { onSuccess: () => toast.success("Question deleted.") });
  }

  function handlePermanentDelete(question: Question) {
    if (!window.confirm("Permanently delete this question? This CANNOT be undone.")) return;
    permanentDelete.mutate(question.id, { onSuccess: () => toast.success("Question permanently deleted.") });
  }

  function runUndo(action: QuestionBulkActionType, ids: string[]) {
    bulkAction.mutate(
      { questionIds: ids, action },
      { onSuccess: (result) => toast.success(`${result.succeeded.length} question(s) undone.`) },
    );
  }

  function runBulk(action: QuestionBulkActionType) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    if (action === "reject") {
      const reason = window.prompt("Rejection reason (applies to all selected questions):");
      if (!reason) return;
      bulkAction.mutate(
        { questionIds: ids, action, rejectionReason: reason },
        {
          onSuccess: (result) => {
            toast.success(
              `${result.succeeded.length} question(s) rejected${result.failed.length ? `, ${result.failed.length} failed` : ""}.`,
            );
            setSelected(new Set());
          },
        },
      );
      return;
    }

    if (action === "delete" && !window.confirm(`Delete ${ids.length} question(s)? They can be restored from the Deleted tab.`)) {
      return;
    }
    if (action === "permanent-delete" && !window.confirm(`Permanently delete ${ids.length} question(s)? This CANNOT be undone.`)) {
      return;
    }

    bulkAction.mutate(
      { questionIds: ids, action },
      {
        onSuccess: (result) => {
          const failedSuffix = result.failed.length ? `, ${result.failed.length} failed` : "";
          toast.success(`${result.succeeded.length} question(s) updated${failedSuffix}.`, {
            action: result.undoAction
              ? { label: "Undo", onClick: () => runUndo(result.undoAction as QuestionBulkActionType, result.succeeded) }
              : undefined,
          });
          setSelected(new Set());
        },
        onError: () => toast.error("Bulk action failed."),
      },
    );
  }

  const showApproveReject = !tab.deleted && (tab.status === "pending-review" || tab.status === "");
  const showPublish = !tab.deleted && tab.status === "draft";
  const showArchive = !tab.deleted && tab.status === "approved";
  const showUnarchive = !tab.deleted && tab.status === "archived";
  const showRestore = tab.deleted;
  const showPermanentDelete = tab.deleted;
  const showDelete = !tab.deleted;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Manage Questions</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${total} question${total === 1 ? "" : "s"} — ${tab.label.toLowerCase()}.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Button
            key={t.label}
            size="sm"
            variant={tab.label === t.label ? "primary" : "secondary"}
            onClick={() => switchTab(t)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SOURCE_FILTERS.map((f) => (
          <Button
            key={f.label}
            size="sm"
            variant={sourceType === f.value ? "primary" : "secondary"}
            onClick={() => {
              setSourceType(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          placeholder="Search question text…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          containerClassName="sm:max-w-xs"
        />

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-1.5">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            {showApproveReject && (
              <Button size="sm" onClick={() => runBulk("approve")} disabled={bulkAction.isPending}>
                <CheckCircle2 className="size-3.5" />
                Approve
              </Button>
            )}
            {showApproveReject && (
              <Button variant="secondary" size="sm" onClick={() => runBulk("reject")} disabled={bulkAction.isPending}>
                <XCircle className="size-3.5" />
                Reject
              </Button>
            )}
            {showPublish && (
              <Button size="sm" onClick={() => runBulk("publish")} disabled={bulkAction.isPending}>
                <Sparkles className="size-3.5" />
                Publish
              </Button>
            )}
            {showArchive && (
              <Button variant="secondary" size="sm" onClick={() => runBulk("archive")} disabled={bulkAction.isPending}>
                <Archive className="size-3.5" />
                Archive
              </Button>
            )}
            {showUnarchive && (
              <Button variant="secondary" size="sm" onClick={() => runBulk("unarchive")} disabled={bulkAction.isPending}>
                <ArchiveRestore className="size-3.5" />
                Unarchive
              </Button>
            )}
            {showRestore && (
              <Button size="sm" onClick={() => runBulk("restore")} disabled={bulkAction.isPending}>
                <RotateCcw className="size-3.5" />
                Restore
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setBulkEditing(true)}>
              <ListChecks className="size-3.5" />
              Bulk edit
            </Button>
            {showDelete && (
              <Button variant="destructive" size="sm" onClick={() => runBulk("delete")} disabled={bulkAction.isPending}>
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            )}
            {showPermanentDelete && (
              <Button variant="destructive" size="sm" onClick={() => runBulk("permanent-delete")} disabled={bulkAction.isPending}>
                <Trash2 className="size-3.5" />
                Delete permanently
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load these questions." onRetry={() => refetch()} />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing here"
          description={tab.deleted ? "No deleted questions." : `No questions are currently ${tab.label.toLowerCase()}.`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={selected.size === questions.length}
              onChange={toggleSelectAll}
              className="size-3.5 rounded border-border"
            />
            Select all
          </label>

          {questions.map((question) => (
            <Card key={question.id} className="p-5">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(question.id)}
                  onChange={() => toggleSelected(question.id)}
                  className="mt-1 size-3.5 rounded border-border"
                  aria-label="Select question"
                />
                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="accent">{SOURCE_LABEL[question.sourceType] ?? question.sourceType}</Badge>
                    <DifficultyBadge difficulty={question.difficulty} />
                    <Badge variant="neutral" className="capitalize">
                      {question.status.replace("-", " ")}
                    </Badge>
                    {question.deletedAt && (
                      <Badge variant="incorrect">Deleted {formatRelativeTime(question.deletedAt)}</Badge>
                    )}
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
                  <ExplanationSection
                    correctExplanation={question.correctExplanation}
                    solutionSteps={question.solutionSteps}
                  />
                  {question.status === "rejected" && question.rejectionReason && (
                    <p className="text-xs text-incorrect-600">Rejected: {question.rejectionReason}</p>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
                    {!question.deletedAt && question.status === "pending-review" && (
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
                    )}
                    {!question.deletedAt && question.status === "draft" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          publishDraft.mutate(question.id, {
                            onSuccess: () => toast.success("Published — now visible in the Question Bank."),
                            onError: () => toast.error("Couldn't publish this question."),
                          })
                        }
                        disabled={publishDraft.isPending}
                      >
                        <Sparkles className="size-3.5" />
                        Publish
                      </Button>
                    )}
                    {!question.deletedAt && question.status === "pending-review" && (
                      <Button variant="secondary" size="sm" onClick={() => handleReject(question)} disabled={setStatus.isPending}>
                        <XCircle className="size-3.5" />
                        Reject
                      </Button>
                    )}
                    {!question.deletedAt && question.status === "approved" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          archive.mutate(question.id, { onSuccess: () => toast.success("Question archived.") })
                        }
                        disabled={archive.isPending}
                      >
                        <Archive className="size-3.5" />
                        Archive
                      </Button>
                    )}
                    {!question.deletedAt && question.status === "archived" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          unarchive.mutate(question.id, { onSuccess: () => toast.success("Question unarchived.") })
                        }
                        disabled={unarchive.isPending}
                      >
                        <ArchiveRestore className="size-3.5" />
                        Unarchive
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => setEditingQuestion(question)}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    {question.deletedAt ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            restore.mutate(question.id, { onSuccess: () => toast.success("Question restored.") })
                          }
                          disabled={restore.isPending}
                        >
                          <RotateCcw className="size-3.5" />
                          Restore
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handlePermanentDelete(question)} disabled={permanentDelete.isPending}>
                          <Trash2 className="size-3.5" />
                          Delete permanently
                        </Button>
                      </>
                    ) : (
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(question)} disabled={remove.isPending}>
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="size-3.5" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      <EditQuestionDialog
        question={editingQuestion}
        open={editingQuestion !== null}
        onOpenChange={(open) => !open && setEditingQuestion(null)}
      />
      <BulkUpdateDialog
        questionIds={Array.from(selected)}
        open={bulkEditing}
        onOpenChange={setBulkEditing}
      />
    </div>
  );
}
