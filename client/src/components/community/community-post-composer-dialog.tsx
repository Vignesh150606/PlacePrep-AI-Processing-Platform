import { useState } from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Paperclip, X } from "lucide-react";
import type { CommunityCategory } from "@placeprep/shared";
import { COMMUNITY_CATEGORIES } from "@placeprep/shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCreateCommunityPost } from "@/hooks/use-community";
import { useCompanies } from "@/hooks/use-companies";
import { ApiError } from "@/lib/api-client";
import { formatBytes } from "@/lib/format";

const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass =
  "min-h-28 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Same accept set the backend actually validates (settings.allowed_upload_mime_types,
// reused as-is in community.py's create_post) -- pdf + image, same as resources.py.
const ACCEPTED_FILE_TYPES = "application/pdf,image/png,image/jpeg,image/jpg";
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;

const composerSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().min(1, "Add a description").max(20000),
  category: z.string().min(1, "Choose a category"),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  tags: z.string().optional(),
  isAnonymous: z.boolean(),
});

type ComposerFormValues = z.infer<typeof composerSchema>;

const EMPTY_FORM: ComposerFormValues = {
  title: "",
  description: "",
  category: "",
  companyId: "",
  companyName: "",
  tags: "",
  isAnonymous: false,
};

interface CommunityPostComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fills and locks the company (used from a Company Hub's Community
   * tab) -- same "start a conversation about the thing you're already
   * looking at" affordance the brief's Company Hub integration implies. */
  defaultCompanyId?: string;
  defaultCompanyName?: string;
}

export function CommunityPostComposerDialog({
  open,
  onOpenChange,
  defaultCompanyId,
  defaultCompanyName,
}: CommunityPostComposerDialogProps) {
  const { data: companyData } = useCompanies();
  const create = useCreateCommunityPost();
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const { control, handleSubmit, register, reset } = useForm<ComposerFormValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: {
      ...EMPTY_FORM,
      companyId: defaultCompanyId ?? "",
      companyName: defaultCompanyName ?? "",
    },
  });

  const companies = companyData?.items ?? [];

  function handleFilesChange(candidates: FileList | null) {
    setFileError(null);
    if (!candidates || candidates.length === 0) return;
    const next = [...files];
    for (const candidate of Array.from(candidates)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setFileError(`You can attach at most ${MAX_ATTACHMENTS} files.`);
        break;
      }
      if (!ACCEPTED_FILE_TYPES.split(",").includes(candidate.type)) {
        setFileError("Only PDF, PNG, or JPEG files are accepted.");
        continue;
      }
      if (candidate.size > MAX_FILE_SIZE_BYTES) {
        setFileError(`'${candidate.name}' exceeds the ${formatBytes(MAX_FILE_SIZE_BYTES)} limit.`);
        continue;
      }
      next.push(candidate);
    }
    setFiles(next);
  }

  function removeFile(index: number) {
    setFiles((f) => f.filter((_, i) => i !== index));
  }

  function handleClose(next: boolean) {
    if (!next) {
      reset({ ...EMPTY_FORM, companyId: defaultCompanyId ?? "", companyName: defaultCompanyName ?? "" });
      setFiles([]);
      setFileError(null);
    }
    onOpenChange(next);
  }

  const onSubmit = (values: ComposerFormValues) => {
    create.mutate(
      {
        title: values.title,
        description: values.description,
        category: values.category as CommunityCategory,
        isAnonymous: values.isAnonymous,
        companyId: values.companyId || undefined,
        companyName: values.companyName || undefined,
        tags: values.tags
          ? values.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined,
        attachments: files,
      },
      {
        onSuccess: () => {
          toast.success("Post published.");
          handleClose(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't publish your post."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start a discussion</DialogTitle>
          <DialogDescription>
            Ask a doubt, share an OA experience, discuss a company, or post a preparation strategy. Visible to
            everyone as soon as you publish.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="e.g. TCS NQT OA — pattern for round 2?" {...register("title")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              rows={5}
              placeholder="Markdown and code blocks (```like this```) are supported."
              className={textareaClass}
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">Category</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <select id="category" className={selectClass} {...field}>
                    <option value="">Select a category</option>
                    {COMMUNITY_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="companyId">Company (optional)</Label>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => (
                  <select id="companyId" className={selectClass} disabled={!!defaultCompanyId} {...field}>
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" placeholder="oa, aptitude, tcs" {...register("tags")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="attachments">
              Attachments (optional — PDF, PNG, or JPEG, up to {MAX_ATTACHMENTS})
            </Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:border-accent-600">
              <Paperclip className="size-4" />
              Click to attach files
              <input
                id="attachments"
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                multiple
                className="hidden"
                onChange={(e) => handleFilesChange(e.target.files)}
              />
            </label>
            {files.length > 0 && (
              <ul className="flex flex-col gap-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {f.name} · {formatBytes(f.size)}
                    </span>
                    <button type="button" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fileError && <p className="text-xs text-incorrect-600">{fileError}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="size-4 rounded border-border" {...register("isAnonymous")} />
            Post anonymously
          </label>

          <Button type="submit" disabled={create.isPending} className="w-fit">
            {create.isPending ? "Publishing..." : "Publish post"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
