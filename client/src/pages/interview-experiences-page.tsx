import { useMemo, useState } from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { z } from "zod";
import {
  Bookmark,
  Building2,
  ChevronDown,
  ChevronUp,
  Flag,
  MessageSquareText,
  Pencil,
  Pin,
  Plus,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import type { EmploymentType, InterviewExperience } from "@placeprep/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ROUND_TYPE_LABELS, OUTCOME_VARIANT } from "@/lib/interview-labels";
import { useIsAdmin } from "@/hooks/use-profile";
import { useProfile } from "@/hooks/use-profile";
import { useCompanies } from "@/hooks/use-companies";
import { useBookmarks } from "@/hooks/use-bookmarks";
import {
  useCreateExperience,
  useDeleteExperience,
  useInterviewExperiences,
  useUpdateExperience,
  useUpdateExperienceStatus,
  useVoteExperience,
  useReportExperience,
  type ExperienceFilters,
  type ExperienceSubmission,
} from "@/hooks/use-interview-experiences";
import { ApiError } from "@/lib/api-client";

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  internship: "Internship",
  "full-time": "Full-time",
};

const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass =
  "min-h-20 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const roundSchema = z.object({
  type: z.enum(["online-assessment", "technical", "hr", "managerial", "group-discussion"]),
  title: z.string().min(1, "Title required"),
  description: z.string(),
  durationMinutes: z.number().nullable(),
});

const submissionSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  isAnonymous: z.boolean(),
  role: z.string().min(1, "Role is required"),
  employmentType: z.enum(["internship", "full-time"]),
  packageLpa: z.number().nullable(),
  driveDate: z.string().nullable(),
  college: z.string().nullable(),
  department: z.string().nullable(),
  graduationYear: z.number().min(1990).max(2100),
  outcome: z.enum(["selected", "rejected", "in-progress", "withdrawn"]),
  rounds: z.array(roundSchema),
  overallTips: z.string(),
  resourcesUsed: z.string().nullable(),
  additionalNotes: z.string().nullable(),
  keyTopics: z.string().nullable(), // comma-separated in the form, split on submit
  processDuration: z.string().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

type SubmissionFormValues = z.infer<typeof submissionSchema>;

function emptyForm(defaults: { college?: string | null; department?: string | null; graduationYear?: number | null }): SubmissionFormValues {
  return {
    companyId: "",
    isAnonymous: false,
    role: "",
    employmentType: "full-time",
    packageLpa: null,
    driveDate: null,
    college: defaults.college ?? null,
    department: defaults.department ?? null,
    graduationYear: defaults.graduationYear ?? new Date().getFullYear(),
    outcome: "selected",
    rounds: [],
    overallTips: "",
    resourcesUsed: null,
    additionalNotes: null,
    keyTopics: null,
    processDuration: null,
    difficulty: "medium",
  };
}

function toFormValues(exp: InterviewExperience): SubmissionFormValues {
  return {
    companyId: exp.companyId,
    isAnonymous: exp.isAnonymous,
    role: exp.role,
    employmentType: exp.employmentType,
    packageLpa: exp.packageLpa ?? null,
    driveDate: exp.driveDate ?? null,
    college: exp.college ?? null,
    department: exp.department ?? null,
    graduationYear: exp.graduationYear,
    outcome: exp.outcome,
    rounds: exp.rounds.map((r) => ({
      type: r.type,
      title: r.title,
      description: r.description,
      durationMinutes: r.durationMinutes,
    })),
    overallTips: exp.overallTips,
    resourcesUsed: exp.resourcesUsed ?? null,
    additionalNotes: exp.additionalNotes ?? null,
    keyTopics: exp.keyTopics?.join(", ") ?? null,
    processDuration: exp.processDuration ?? null,
    difficulty: exp.difficulty,
  };
}

export function SubmissionDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: InterviewExperience | null;
}) {
  const { data: companyData } = useCompanies();
  const { data: profile } = useProfile();
  const companies = companyData?.items ?? [];
  const create = useCreateExperience();
  const update = useUpdateExperience();
  const isSaving = create.isPending || update.isPending;

  const { control, handleSubmit, register } = useForm<SubmissionFormValues>({
    resolver: zodResolver(submissionSchema),
    values: editing
      ? toFormValues(editing)
      : emptyForm({ college: profile?.college, department: profile?.department, graduationYear: profile?.year }),
  });
  const { fields, append, remove } = useFieldArray({ control, name: "rounds" });

  const onSubmit = (values: SubmissionFormValues) => {
    const payload: ExperienceSubmission = {
      ...values,
      keyTopics: values.keyTopics
        ? values.keyTopics.split(",").map((t) => t.trim()).filter(Boolean)
        : null,
      rounds: values.rounds.map((r, idx) => ({ ...r, id: String(idx) })),
    };

    if (editing) {
      update.mutate(
        { id: editing.id, ...payload },
        {
          onSuccess: () => {
            toast.success("Experience updated.");
            onOpenChange(false);
          },
          onError: (err) => toast.error(err instanceof ApiError ? err.message : "Update failed."),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Thanks for sharing! It'll be visible once an admin reviews it.");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Submission failed."),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit interview experience" : "Share your interview experience"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes are visible immediately."
              : "Help future students prepare. Your submission is reviewed by an admin before it's visible to others."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="companyId">Company</Label>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => (
                  <select id="companyId" className={selectClass} {...field}>
                    <option value="">Select a company</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="role">Role</Label>
              <Input id="role" placeholder="e.g. SDE-1" {...register("role")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="employmentType">Type</Label>
              <Controller
                control={control}
                name="employmentType"
                render={({ field }) => (
                  <select id="employmentType" className={selectClass} {...field}>
                    {Object.entries(EMPLOYMENT_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="packageLpa">Package (LPA)</Label>
              <Controller
                control={control}
                name="packageLpa"
                render={({ field }) => (
                  <Input
                    id="packageLpa"
                    type="number"
                    step="0.1"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="outcome">Outcome</Label>
              <Controller
                control={control}
                name="outcome"
                render={({ field }) => (
                  <select id="outcome" className={selectClass} {...field}>
                    <option value="selected">Selected</option>
                    <option value="rejected">Rejected</option>
                    <option value="in-progress">In progress</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="graduationYear">Graduation year</Label>
              <Input id="graduationYear" type="number" {...register("graduationYear", { valueAsNumber: true })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="department">Department</Label>
              <Input id="department" placeholder="e.g. CSE" {...register("department")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Controller
                control={control}
                name="difficulty"
                render={({ field }) => (
                  <select id="difficulty" className={selectClass} {...field}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Round-wise breakdown</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => append({ type: "technical", title: "", description: "", durationMinutes: null })}
              >
                <Plus className="size-3.5" /> Add round
              </Button>
            </div>
            {fields.map((field, idx) => (
              <div key={field.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name={`rounds.${idx}.type`}
                    render={({ field: f }) => (
                      <select className={cn(selectClass, "flex-1")} {...f}>
                        {Object.entries(ROUND_TYPE_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                  <Input
                    className="flex-1"
                    placeholder="Round title"
                    {...register(`rounds.${idx}.title` as const)}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                    <X className="size-4" />
                  </Button>
                </div>
                <textarea
                  className={textareaClass}
                  placeholder="What happened in this round — questions asked, format, etc."
                  {...register(`rounds.${idx}.description` as const)}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="overallTips">Overall tips &amp; advice</Label>
            <textarea id="overallTips" className={textareaClass} {...register("overallTips")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="keyTopics">Key topics (comma-separated)</Label>
              <Controller
                control={control}
                name="keyTopics"
                render={({ field }) => (
                  <Input
                    id="keyTopics"
                    placeholder="Trees, Graphs, DP"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                  />
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="resourcesUsed">Resources used</Label>
              <Controller
                control={control}
                name="resourcesUsed"
                render={({ field }) => (
                  <Input
                    id="resourcesUsed"
                    placeholder="e.g. Striver's SDE sheet, LeetCode"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="additionalNotes">Additional notes</Label>
            <Controller
              control={control}
              name="additionalNotes"
              render={({ field }) => (
                <textarea
                  id="additionalNotes"
                  className={textareaClass}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value || null)}
                />
              )}
            />
          </div>

          {!editing && (
            <Controller
              control={control}
              name="isAnonymous"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="size-4 rounded border-border"
                  />
                  Submit anonymously (your name is hidden from other students; admins can still see it for
                  moderation)
                </label>
              )}
            />
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {editing ? "Save changes" : "Submit for review"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  experienceId,
  open,
  onOpenChange,
}: {
  experienceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const updateStatus = useUpdateExperienceStatus();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this experience</DialogTitle>
          <DialogDescription>Shown to the student who submitted it.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Input id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!reason.trim() || updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate(
                { id: experienceId, status: "rejected", rejectionReason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success("Experience rejected.");
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            Reject
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExperienceCard({
  experience,
  companyName,
  isAdmin,
  onEdit,
}: {
  experience: InterviewExperience;
  companyName: string;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { isBookmarked, toggle } = useBookmarks();
  const vote = useVoteExperience();
  const report = useReportExperience();
  const updateStatus = useUpdateExperienceStatus();
  const updateExperience = useUpdateExperience();
  const deleteExperience = useDeleteExperience();
  const [rejectOpen, setRejectOpen] = useState(false);

  const bookmarked = isBookmarked(experience.id);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">
                {companyName} — {experience.role}
              </p>
              {experience.isPinned && <Pin className="size-3.5 text-accent-600" />}
              <Badge variant="neutral">{EMPLOYMENT_LABELS[experience.employmentType]}</Badge>
              <DifficultyBadge difficulty={experience.difficulty} />
              <Badge variant={OUTCOME_VARIANT[experience.outcome] ?? "neutral"} className="capitalize">
                {experience.outcome.replace("-", " ")}
              </Badge>
              {experience.status !== "approved" && (
                <Badge variant={experience.status === "rejected" ? "incorrect" : "warning"} className="capitalize">
                  {experience.status.replace("-", " ")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {experience.department ?? "—"} · Class of {experience.graduationYear}
              {typeof experience.packageLpa === "number" && ` · ₹${experience.packageLpa} LPA`}
              {experience.isAnonymous && !experience.authorId && " · Anonymous"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setExpanded((e) => !e)} aria-label="Toggle details">
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>

        {expanded && (
          <div className="flex flex-col gap-3 border-t border-border pt-3 text-sm">
            {experience.rounds.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Round-wise breakdown
                </p>
                {experience.rounds.map((r) => (
                  <div key={r.id} className="rounded-lg bg-surface p-2">
                    <p className="font-medium text-foreground">
                      {ROUND_TYPE_LABELS[r.type]} — {r.title}
                      {r.durationMinutes ? ` (${r.durationMinutes} min)` : ""}
                    </p>
                    {r.description && <p className="text-muted-foreground">{r.description}</p>}
                  </div>
                ))}
              </div>
            )}
            {experience.overallTips && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tips &amp; advice
                </p>
                <p className="text-foreground">{experience.overallTips}</p>
              </div>
            )}
            {experience.keyTopics && experience.keyTopics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {experience.keyTopics.map((t) => (
                  <Badge key={t} variant="accent">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            {experience.resourcesUsed && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Resources: </span>
                {experience.resourcesUsed}
              </p>
            )}
            {experience.additionalNotes && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Notes: </span>
                {experience.additionalNotes}
              </p>
            )}
            {experience.rejectionReason && isAdmin && (
              <p className="text-incorrect-600">Rejected: {experience.rejectionReason}</p>
            )}
            <p className="text-xs text-muted-foreground">Shared {formatDate(experience.createdAt)}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => vote.mutate({ id: experience.id, voteType: "helpful" })}
            className={cn(experience.myVote === "helpful" && "text-correct-600")}
          >
            <ThumbsUp className="size-3.5" /> {experience.upvoteCount}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => vote.mutate({ id: experience.id, voteType: "not-helpful" })}
            className={cn(experience.myVote === "not-helpful" && "text-incorrect-600")}
          >
            <ThumbsDown className="size-3.5" /> {experience.notHelpfulCount}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => toggle(experience.id, "interview-experience")}>
            <Bookmark className={cn("size-3.5", bookmarked && "fill-current")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const reason = window.prompt("Why are you reporting this experience?");
              if (reason?.trim()) {
                report.mutate(
                  { id: experience.id, reason: reason.trim() },
                  { onSuccess: (msg) => toast.success(typeof msg === "string" ? msg : "Reported.") },
                );
              }
            }}
          >
            <Flag className="size-3.5" />
          </Button>

          {isAdmin && (
            <div className="ml-auto flex items-center gap-1">
              {experience.status === "pending-review" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateStatus.mutate(
                        { id: experience.id, status: "approved" },
                        { onSuccess: () => toast.success("Approved.") },
                      )
                    }
                  >
                    <ShieldCheck className="size-3.5" /> Approve
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  updateExperience.mutate({ id: experience.id, isPinned: !experience.isPinned } as never)
                }
                aria-label="Pin"
              >
                <Pin className={cn("size-4", experience.isPinned && "fill-current text-accent-600")} />
              </Button>
              <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit">
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (window.confirm("Delete this experience? This can't be undone.")) {
                    deleteExperience.mutate(experience.id, { onSuccess: () => toast.success("Deleted.") });
                  }
                }}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {rejectOpen && <RejectDialog experienceId={experience.id} open={rejectOpen} onOpenChange={setRejectOpen} />}
      </CardContent>
    </Card>
  );
}

export function InterviewExperiencesPage() {
  const isAdmin = useIsAdmin();
  const [filters, setFilters] = useState<ExperienceFilters>({});
  const [submitOpen, setSubmitOpen] = useState(false);
  const [editingExperience, setEditingExperience] = useState<InterviewExperience | null>(null);

  const { data, isLoading, isError, refetch } = useInterviewExperiences(filters);
  const { data: companyData } = useCompanies();
  const companies = useMemo(() => companyData?.items ?? [], [companyData]);
  const companyNameById = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const experiences = data?.items ?? [];

  const openCreate = () => {
    setEditingExperience(null);
    setSubmitOpen(true);
  };
  const openEdit = (exp: InterviewExperience) => {
    setEditingExperience(exp);
    setSubmitOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Interview Experiences</h1>
          <p className="text-sm text-muted-foreground">
            Real placement experiences from students who've been through it — reviewed by admins before
            publishing.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <MessageSquareText className="size-4" /> Share your experience
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className={selectClass}
          value={filters.companyId ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, companyId: e.target.value || undefined }))}
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={filters.difficulty ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value || undefined }))}
        >
          <option value="">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select
          className={selectClass}
          value={filters.roundType ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, roundType: e.target.value || undefined }))}
        >
          <option value="">Any round type</option>
          {Object.entries(ROUND_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <Input
          placeholder="Department"
          className="h-9 w-32"
          value={filters.department ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value || undefined }))}
        />
        <Input
          placeholder="Year"
          type="number"
          className="h-9 w-24"
          value={filters.graduationYear ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, graduationYear: e.target.value ? Number(e.target.value) : undefined }))
          }
        />
        {isAdmin && (
          <select
            className={selectClass}
            value={filters.status ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, status: (e.target.value || undefined) as never }))}
          >
            <option value="">All statuses</option>
            <option value="pending-review">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load interview experiences." onRetry={() => refetch()} />
      ) : experiences.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No experiences yet"
          description="Be the first to share your interview experience and help future students prepare."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Share your experience
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {experiences.map((exp) => (
            <ExperienceCard
              key={exp.id}
              experience={exp}
              companyName={companyNameById.get(exp.companyId) ?? "Unknown company"}
              isAdmin={isAdmin}
              onEdit={() => openEdit(exp)}
            />
          ))}
        </div>
      )}

      <SubmissionDialog open={submitOpen} onOpenChange={setSubmitOpen} editing={editingExperience} />
    </div>
  );
}
