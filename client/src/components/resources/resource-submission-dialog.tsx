import { useState } from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Upload } from "lucide-react";
import { RESOURCE_CATEGORIES } from "@placeprep/shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSubmitResource } from "@/hooks/use-resources";
import { useSubjects } from "@/hooks/use-subjects";
import { useTopics } from "@/hooks/use-topics";
import { useCompanies } from "@/hooks/use-companies";
import { ApiError } from "@/lib/api-client";
import { formatBytes } from "@/lib/format";

const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass =
  "min-h-20 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Same accept set the backend actually validates (settings.allowed_upload_mime_types
// in resources.py) -- pdf + image, same as pdfs.py's upload_pdf.
const ACCEPTED_FILE_TYPES = "application/pdf,image/png,image/jpeg,image/jpg";
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const submissionSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
  category: z.string().min(1, "Choose a category"),
  subjectId: z.string().optional(),
  topicId: z.string().optional(),
  companyId: z.string().optional(),
  difficulty: z.string().optional(),
  tags: z.string().optional(),
  author: z.string().optional(),
  contentMode: z.enum(["file", "link"]),
  externalUrl: z.string().optional(),
});

type SubmissionFormValues = z.infer<typeof submissionSchema>;

const EMPTY_FORM: SubmissionFormValues = {
  title: "",
  description: "",
  category: "",
  subjectId: "",
  topicId: "",
  companyId: "",
  difficulty: "",
  tags: "",
  author: "",
  contentMode: "link",
  externalUrl: "",
};

interface ResourceSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResourceSubmissionDialog({ open, onOpenChange }: ResourceSubmissionDialogProps) {
  const { data: subjectData } = useSubjects();
  const { data: companyData } = useCompanies();
  const submit = useSubmitResource();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const { control, handleSubmit, register, watch, reset } = useForm<SubmissionFormValues>({
    resolver: zodResolver(submissionSchema),
    defaultValues: EMPTY_FORM,
  });

  const subjects = subjectData?.items ?? [];
  const companies = companyData?.items ?? [];
  const contentMode = watch("contentMode");
  const subjectId = watch("subjectId");
  const { data: topicData } = useTopics(subjectId || undefined);
  const topics = topicData?.items ?? [];

  function handleFileChange(candidate: File | undefined) {
    setFileError(null);
    if (!candidate) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_FILE_TYPES.split(",").includes(candidate.type)) {
      setFileError("Only PDF, PNG, or JPEG files are accepted.");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File exceeds the ${formatBytes(MAX_FILE_SIZE_BYTES)} limit.`);
      return;
    }
    setFile(candidate);
  }

  function handleClose(next: boolean) {
    if (!next) {
      reset(EMPTY_FORM);
      setFile(null);
      setFileError(null);
    }
    onOpenChange(next);
  }

  const onSubmit = (values: SubmissionFormValues) => {
    if (values.contentMode === "file" && !file) {
      setFileError("Choose a file to upload.");
      return;
    }
    if (values.contentMode === "link" && !values.externalUrl) {
      toast.error("Add an external link, or switch to file upload.");
      return;
    }

    submit.mutate(
      {
        title: values.title,
        description: values.description || undefined,
        category: values.category,
        subjectId: values.subjectId || undefined,
        topicId: values.topicId || undefined,
        companyId: values.companyId || undefined,
        difficulty: values.difficulty || undefined,
        tags: values.tags
          ? values.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined,
        author: values.author || undefined,
        externalUrl: values.contentMode === "link" ? values.externalUrl : undefined,
        file: values.contentMode === "file" ? file ?? undefined : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Submitted! It's now waiting for admin review.");
          handleClose(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Submission failed."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit a resource</DialogTitle>
          <DialogDescription>
            Share a cheat sheet, roadmap, previous paper, video, or link. An admin reviews every submission
            before it's visible to everyone.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="e.g. DBMS Normalization Cheat Sheet" {...register("title")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              rows={2}
              placeholder="What does this resource cover?"
              className={textareaClass}
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">Category</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <select id="category" className={selectClass} {...field}>
                    <option value="">Select a category</option>
                    {RESOURCE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="difficulty">Difficulty (optional)</Label>
              <Controller
                control={control}
                name="difficulty"
                render={({ field }) => (
                  <select id="difficulty" className={selectClass} {...field}>
                    <option value="">Not applicable</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="subjectId">Subject</Label>
              <Controller
                control={control}
                name="subjectId"
                render={({ field }) => (
                  <select id="subjectId" className={selectClass} {...field}>
                    <option value="">None</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="topicId">Topic</Label>
              <Controller
                control={control}
                name="topicId"
                render={({ field }) => (
                  <select id="topicId" className={selectClass} disabled={!subjectId} {...field}>
                    <option value="">None</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="companyId">Company</Label>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => (
                  <select id="companyId" className={selectClass} {...field}>
                    <option value="">None</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input id="tags" placeholder="dbms, normalization" {...register("tags")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="author">Author / source (optional)</Label>
              <Input id="author" placeholder="Who originally created this?" {...register("author")} />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
            <div className="flex gap-2">
              <Controller
                control={control}
                name="contentMode"
                render={({ field }) => (
                  <>
                    <Button
                      type="button"
                      variant={field.value === "link" ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => field.onChange("link")}
                    >
                      External link
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === "file" ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => field.onChange("file")}
                    >
                      Upload a file
                    </Button>
                  </>
                )}
              />
            </div>

            {contentMode === "link" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="externalUrl">Link</Label>
                <Input
                  id="externalUrl"
                  placeholder="https://..."
                  {...register("externalUrl")}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="file">File (PDF, PNG, or JPEG, up to {formatBytes(MAX_FILE_SIZE_BYTES)})</Label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground hover:border-accent-600">
                  <Upload className="size-4" />
                  {file ? file.name : "Click to choose a file"}
                  <input
                    id="file"
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0])}
                  />
                </label>
                {fileError && <p className="text-xs text-incorrect-600">{fileError}</p>}
              </div>
            )}
          </div>

          <Button type="submit" disabled={submit.isPending} className="w-fit">
            {submit.isPending ? "Submitting..." : "Submit for review"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
