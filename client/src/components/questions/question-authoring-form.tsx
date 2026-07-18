import { useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, X, ImagePlus, Paperclip, Loader2 } from "lucide-react";
import type { QuestionAuthoringInput } from "@placeprep/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompanies } from "@/hooks/use-companies";
import { useUploadQuestionAsset } from "@/hooks/use-question-authoring";
import { cn } from "@/lib/utils";

export const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const textareaClass =
  "min-h-20 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const optionSchema = z.object({
  label: z.string().min(1),
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean(),
});

const authoringSchema = z
  .object({
    type: z.enum(["mcq", "multi-select", "coding", "subjective"]),
    text: z.string().min(5, "Question text is required"),
    options: z.array(optionSchema),
    correctExplanation: z.string().nullable(),
    solutionSteps: z.string().nullable(),
    interviewTip: z.string().nullable(),
    referenceNote: z.string().nullable(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    subject: z.string().nullable(),
    topic: z.string().nullable(),
    companyName: z.string().nullable(),
    tags: z.string().nullable(),
    imageUrls: z.array(z.string()),
    attachmentUrls: z.array(z.string()),
  })
  .refine(
    (v) => v.type !== "mcq" && v.type !== "multi-select" ? true : v.options.filter((o) => o.text.trim()).length >= 2,
    { message: "At least two options are required.", path: ["options"] },
  )
  .refine(
    (v) => v.type !== "mcq" && v.type !== "multi-select" ? true : v.options.some((o) => o.isCorrect),
    { message: "Mark at least one option as correct.", path: ["options"] },
  );

export type AuthoringFormValues = z.infer<typeof authoringSchema>;

function emptyForm(): AuthoringFormValues {
  return {
    type: "mcq",
    text: "",
    options: [
      { label: "A", text: "", isCorrect: false },
      { label: "B", text: "", isCorrect: false },
      { label: "C", text: "", isCorrect: false },
      { label: "D", text: "", isCorrect: false },
    ],
    correctExplanation: null,
    solutionSteps: null,
    interviewTip: null,
    referenceNote: null,
    difficulty: "medium",
    subject: null,
    topic: null,
    companyName: null,
    tags: null,
    imageUrls: [],
    attachmentUrls: [],
  };
}

function toPayload(values: AuthoringFormValues): QuestionAuthoringInput {
  return {
    type: values.type,
    text: values.text,
    options: values.options,
    correctExplanation: values.correctExplanation,
    solutionSteps: values.solutionSteps,
    interviewTip: values.interviewTip,
    referenceNote: values.referenceNote,
    difficulty: values.difficulty,
    subject: values.subject,
    topic: values.topic,
    companyName: values.companyName,
    tags: values.tags ? values.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    imageUrls: values.imageUrls,
    attachmentUrls: values.attachmentUrls,
  };
}

function toFormValues(input: QuestionAuthoringInput): AuthoringFormValues {
  const base = emptyForm();
  return {
    ...base,
    type: input.type,
    text: input.text,
    options: input.options.length ? input.options.map((o) => ({ ...o })) : base.options,
    correctExplanation: input.correctExplanation ?? null,
    solutionSteps: input.solutionSteps ?? null,
    interviewTip: input.interviewTip ?? null,
    referenceNote: input.referenceNote ?? null,
    difficulty: input.difficulty,
    subject: input.subject ?? null,
    topic: input.topic ?? null,
    companyName: input.companyName ?? null,
    tags: input.tags?.length ? input.tags.join(", ") : null,
    imageUrls: input.imageUrls ?? [],
    attachmentUrls: input.attachmentUrls ?? [],
  };
}

export interface QuestionAuthoringFormProps {
  /** Primary action (e.g. "Submit for review", or "Save as draft"). */
  onSubmit: (input: QuestionAuthoringInput) => void;
  submitting?: boolean;
  submitLabel: string;
  /** Optional second action sharing the same form state (e.g. Admin
   * Manual Builder's "Publish now" alongside "Save as draft"). */
  secondaryAction?: {
    label: string;
    onSubmit: (input: QuestionAuthoringInput) => void;
    submitting?: boolean;
  };
  helperText?: string;
  /** Pre-fills the form -- used by the Smart Bulk Parser's "edit this
   * parsed row before importing" dialog. */
  initialValues?: QuestionAuthoringInput;
}

export function QuestionAuthoringForm({
  onSubmit, submitting, submitLabel, secondaryAction, helperText, initialValues,
}: QuestionAuthoringFormProps) {
  const { control, handleSubmit, register, watch, setValue, formState } = useForm<AuthoringFormValues>({
    resolver: zodResolver(authoringSchema),
    defaultValues: initialValues ? toFormValues(initialValues) : emptyForm(),
  });
  const { fields, append, remove } = useFieldArray({ control, name: "options" });
  const { data: companyData } = useCompanies();
  const companies = companyData?.items ?? [];
  const uploadAsset = useUploadQuestionAsset();
  const [pendingAction, setPendingAction] = useState<"primary" | "secondary" | null>(null);

  const type = watch("type");
  const imageUrls = watch("imageUrls");
  const attachmentUrls = watch("attachmentUrls");
  const showOptions = type === "mcq" || type === "multi-select";

  const handleAssetUpload = async (fileList: FileList | null, kind: "image" | "attachment") => {
    const file = fileList?.[0];
    if (!file) return;
    try {
      const result = await uploadAsset.mutateAsync(file);
      if (kind === "image") setValue("imageUrls", [...imageUrls, result.url]);
      else setValue("attachmentUrls", [...attachmentUrls, result.url]);
    } catch {
      toast.error("Upload failed. Try a smaller file or a different format.");
    }
  };

  const submitPrimary = handleSubmit((values) => {
    setPendingAction("primary");
    onSubmit(toPayload(values));
  });
  const submitSecondary = secondaryAction
    ? handleSubmit((values) => {
        setPendingAction("secondary");
        secondaryAction.onSubmit(toPayload(values));
      })
    : undefined;

  return (
    <form className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">Question type</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <select id="type" className={selectClass} {...field}>
                <option value="mcq">MCQ (single answer)</option>
                <option value="multi-select">Multi-select</option>
                <option value="coding">Coding</option>
                <option value="subjective">Subjective</option>
              </select>
            )}
          />
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
        <Label htmlFor="text">Question</Label>
        <textarea id="text" className={cn(textareaClass, "min-h-28")} placeholder="What is..." {...register("text")} />
        {formState.errors.text && <p className="text-xs text-incorrect-500">{formState.errors.text.message}</p>}
      </div>

      {showOptions && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Options</Label>
            <Button
              type="button" variant="ghost" size="sm"
              onClick={() => append({ label: String.fromCharCode(65 + fields.length), text: "", isCorrect: false })}
            >
              <Plus className="size-3.5" /> Add option
            </Button>
          </div>
          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-xs font-semibold text-muted-foreground">
                {field.label}
              </span>
              <Input className="flex-1" placeholder={`Option ${field.label}`} {...register(`options.${idx}.text` as const)} />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Controller
                  control={control}
                  name={`options.${idx}.isCorrect`}
                  render={({ field: f }) => (
                    <input
                      type={type === "multi-select" ? "checkbox" : "radio"}
                      name={type === "multi-select" ? undefined : "single-correct-option"}
                      checked={f.value}
                      onChange={(e) => {
                        if (type === "mcq") {
                          fields.forEach((_, i) => setValue(`options.${i}.isCorrect`, i === idx && e.target.checked));
                        } else {
                          f.onChange(e.target.checked);
                        }
                      }}
                    />
                  )}
                />
                Correct
              </label>
              {fields.length > 2 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {formState.errors.options?.message && (
            <p className="text-xs text-incorrect-500">{formState.errors.options.message}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" placeholder="e.g. DSA" {...register("subject")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="topic">Topic</Label>
          <Input id="topic" placeholder="e.g. Binary Search" {...register("topic")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="companyName">Company (optional)</Label>
          <Input id="companyName" list="authoring-companies" placeholder="e.g. Google" {...register("companyName")} />
          <datalist id="authoring-companies">
            {companies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tags">Tags (comma-separated)</Label>
        <Input id="tags" placeholder="arrays, two-pointers" {...register("tags")} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="correctExplanation">Explanation</Label>
          <textarea id="correctExplanation" className={textareaClass} placeholder="Why is this the correct answer?" {...register("correctExplanation")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="solutionSteps">Full solution</Label>
          <textarea id="solutionSteps" className={textareaClass} placeholder="Step-by-step worked solution" {...register("solutionSteps")} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="interviewTip">Interview tip</Label>
          <textarea id="interviewTip" className={textareaClass} placeholder="What an interviewer looks for here" {...register("interviewTip")} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="referenceNote">Reference</Label>
          <textarea id="referenceNote" className={textareaClass} placeholder="A book, course, or link" {...register("referenceNote")} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label>Images</Label>
          <div className="flex flex-wrap gap-2">
            {imageUrls.map((url) => (
              <div key={url} className="relative">
                <img src={url} alt="" loading="lazy" className="h-16 w-16 rounded-lg border border-border object-cover" />
                <button
                  type="button"
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-incorrect-500 text-white"
                  onClick={() => setValue("imageUrls", imageUrls.filter((u) => u !== url))}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-surface">
              {uploadAsset.isPending ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAssetUpload(e.target.files, "image")} />
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Attachments</Label>
          <div className="flex flex-col gap-1.5">
            {attachmentUrls.map((url) => (
              <div key={url} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-xs">
                <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-accent-600 hover:underline">
                  <Paperclip className="size-3.5" /> {url.split("/").pop()}
                </a>
                <button type="button" onClick={() => setValue("attachmentUrls", attachmentUrls.filter((u) => u !== url))}>
                  <X className="size-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface">
              {uploadAsset.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
              Attach a reference file
              <input type="file" className="hidden" onChange={(e) => handleAssetUpload(e.target.files, "attachment")} />
            </label>
          </div>
        </div>
      </div>

      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
        {secondaryAction && (
          <Button
            type="button" variant="secondary"
            disabled={submitting || secondaryAction.submitting}
            onClick={submitSecondary}
          >
            {pendingAction === "secondary" && secondaryAction.submitting && <Loader2 className="size-3.5 animate-spin" />}
            {secondaryAction.label}
          </Button>
        )}
        <Button type="button" disabled={submitting || secondaryAction?.submitting} onClick={submitPrimary}>
          {pendingAction === "primary" && submitting && <Loader2 className="size-3.5 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
