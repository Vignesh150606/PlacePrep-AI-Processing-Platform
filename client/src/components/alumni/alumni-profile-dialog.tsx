import { useEffect } from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import type { AlumniProfile } from "@placeprep/shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSubmitAlumniProfile, useUpdateMyAlumniProfile } from "@/hooks/use-alumni";
import { useCompanies } from "@/hooks/use-companies";
import { ApiError } from "@/lib/api-client";

const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass =
  "min-h-16 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const profileSchema = z.object({
  currentRole: z.string().min(1, "Your current role is required").max(200),
  currentCompanyId: z.string().optional(),
  currentCompanyName: z.string().optional(),
  department: z.string().optional(),
  graduationYear: z
    .string()
    .min(1, "Graduation year is required")
    .refine((v) => Number(v) >= 1990 && Number(v) <= 2100, "Enter a valid year"),
  location: z.string().optional(),
  skills: z.string().optional(),
  domains: z.string().optional(),
  technologies: z.string().optional(),
  bio: z.string().optional(),
  careerJourney: z.string().optional(),
  preparationStrategy: z.string().optional(),
  resumeTips: z.string().optional(),
  interviewTips: z.string().optional(),
  placementAdvice: z.string().optional(),
  mentorshipAvailable: z.enum(["true", "false"]),
  isAnonymous: z.enum(["true", "false"]),
  linkedinUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  githubUrl: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const EMPTY_FORM: ProfileFormValues = {
  currentRole: "",
  currentCompanyId: "",
  currentCompanyName: "",
  department: "",
  graduationYear: "",
  location: "",
  skills: "",
  domains: "",
  technologies: "",
  bio: "",
  careerJourney: "",
  preparationStrategy: "",
  resumeTips: "",
  interviewTips: "",
  placementAdvice: "",
  mentorshipAvailable: "false",
  isAnonymous: "false",
  linkedinUrl: "",
  portfolioUrl: "",
  githubUrl: "",
};

function toCsv(values?: string[]): string {
  return values?.join(", ") ?? "";
}

function fromCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const parsed = value.split(",").map((v) => v.trim()).filter(Boolean);
  return parsed.length ? parsed : undefined;
}

function fromExisting(existing?: AlumniProfile | null): ProfileFormValues {
  if (!existing) return EMPTY_FORM;
  return {
    currentRole: existing.currentRole,
    currentCompanyId: existing.currentCompanyId ?? "",
    currentCompanyName: existing.currentCompanyName ?? "",
    department: existing.department ?? "",
    graduationYear: String(existing.graduationYear),
    location: existing.location ?? "",
    skills: toCsv(existing.skills),
    domains: toCsv(existing.domains),
    technologies: toCsv(existing.technologies),
    bio: existing.bio ?? "",
    careerJourney: existing.careerJourney ?? "",
    preparationStrategy: existing.preparationStrategy ?? "",
    resumeTips: existing.resumeTips ?? "",
    interviewTips: existing.interviewTips ?? "",
    placementAdvice: existing.placementAdvice ?? "",
    mentorshipAvailable: existing.mentorshipAvailable ? "true" : "false",
    isAnonymous: existing.isAnonymous ? "true" : "false",
    linkedinUrl: existing.linkedinUrl ?? "",
    portfolioUrl: existing.portfolioUrl ?? "",
    githubUrl: existing.githubUrl ?? "",
  };
}

interface AlumniProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this existing profile instead of
   * creating a new one. Editing is available at ANY verification status
   * -- see alumni.py's `update_my_alumni_profile` docstring. */
  existing?: AlumniProfile | null;
}

export function AlumniProfileDialog({ open, onOpenChange, existing }: AlumniProfileDialogProps) {
  const { data: companyData } = useCompanies();
  const submit = useSubmitAlumniProfile();
  const update = useUpdateMyAlumniProfile();
  const isEditing = !!existing;
  const mutation = isEditing ? update : submit;

  const { control, handleSubmit, register, reset } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: fromExisting(existing),
  });

  useEffect(() => {
    if (open) reset(fromExisting(existing));
  }, [open, existing, reset]);

  const companies = companyData?.items ?? [];

  function handleClose(next: boolean) {
    if (!next) reset(EMPTY_FORM);
    onOpenChange(next);
  }

  const onSubmit = (values: ProfileFormValues) => {
    const payload = {
      currentRole: values.currentRole,
      currentCompanyId: values.currentCompanyId || undefined,
      currentCompanyName: values.currentCompanyName || undefined,
      department: values.department || undefined,
      graduationYear: Number(values.graduationYear),
      location: values.location || undefined,
      skills: fromCsv(values.skills),
      domains: fromCsv(values.domains),
      technologies: fromCsv(values.technologies),
      bio: values.bio || undefined,
      careerJourney: values.careerJourney || undefined,
      preparationStrategy: values.preparationStrategy || undefined,
      resumeTips: values.resumeTips || undefined,
      interviewTips: values.interviewTips || undefined,
      placementAdvice: values.placementAdvice || undefined,
      mentorshipAvailable: values.mentorshipAvailable === "true",
      isAnonymous: values.isAnonymous === "true",
      linkedinUrl: values.linkedinUrl || undefined,
      portfolioUrl: values.portfolioUrl || undefined,
      githubUrl: values.githubUrl || undefined,
    };

    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success(
          isEditing ? "Alumni profile updated." : "Submitted! It's now waiting for admin verification.",
        );
        handleClose(false);
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save your profile."),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit your alumni profile" : "Become a verified alumnus"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Keep your profile current -- students see this in the Alumni Directory and on your company's page."
              : "Share your journey with current students. An admin verifies every request before it appears in the directory."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="currentRole">Current role</Label>
              <Input id="currentRole" placeholder="e.g. SDE II" {...register("currentRole")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="graduationYear">Graduation year</Label>
              <Input id="graduationYear" type="number" placeholder="2024" {...register("graduationYear")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="currentCompanyId">Company (if listed)</Label>
              <Controller
                control={control}
                name="currentCompanyId"
                render={({ field }) => (
                  <select id="currentCompanyId" className={selectClass} {...field}>
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="currentCompanyName">Company name (if not listed)</Label>
              <Input id="currentCompanyName" placeholder="e.g. a startup" {...register("currentCompanyName")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="department">Department</Label>
              <Input id="department" placeholder="e.g. EEE" {...register("department")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="location">Location (optional)</Label>
              <Input id="location" placeholder="e.g. Bengaluru" {...register("location")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="skills">Skills (comma-separated)</Label>
              <Input id="skills" placeholder="DSA, System Design" {...register("skills")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="domains">Domains</Label>
              <Input id="domains" placeholder="Backend, ML" {...register("domains")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="technologies">Technologies</Label>
              <Input id="technologies" placeholder="Python, React" {...register("technologies")} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="bio">Bio</Label>
            <textarea id="bio" rows={2} className={textareaClass} {...register("bio")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="careerJourney">Career journey</Label>
            <textarea id="careerJourney" rows={2} className={textareaClass} {...register("careerJourney")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="preparationStrategy">Preparation strategy</Label>
              <textarea id="preparationStrategy" rows={2} className={textareaClass} {...register("preparationStrategy")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="interviewTips">Interview tips</Label>
              <textarea id="interviewTips" rows={2} className={textareaClass} {...register("interviewTips")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="resumeTips">Resume tips</Label>
              <textarea id="resumeTips" rows={2} className={textareaClass} {...register("resumeTips")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="placementAdvice">Placement advice</Label>
              <textarea id="placementAdvice" rows={2} className={textareaClass} {...register("placementAdvice")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="linkedinUrl">LinkedIn (optional)</Label>
              <Input id="linkedinUrl" placeholder="https://linkedin.com/in/..." {...register("linkedinUrl")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="portfolioUrl">Portfolio (optional)</Label>
              <Input id="portfolioUrl" placeholder="https://..." {...register("portfolioUrl")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="githubUrl">GitHub (optional)</Label>
              <Input id="githubUrl" placeholder="https://github.com/..." {...register("githubUrl")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
              <Label>Mentorship availability</Label>
              <p className="text-xs text-muted-foreground">
                Foundation only for now -- no chat or scheduling yet, just whether students can see you're open to it.
              </p>
              <Controller
                control={control}
                name="mentorshipAvailable"
                render={({ field }) => (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={field.value === "true" ? "primary" : "secondary"}
                      onClick={() => field.onChange("true")}
                    >
                      Available
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={field.value === "false" ? "primary" : "secondary"}
                      onClick={() => field.onChange("false")}
                    >
                      Unavailable
                    </Button>
                  </div>
                )}
              />
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
              <Label>Show my name</Label>
              <p className="text-xs text-muted-foreground">
                Choose to appear anonymously in the directory instead of by name.
              </p>
              <Controller
                control={control}
                name="isAnonymous"
                render={({ field }) => (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={field.value === "false" ? "primary" : "secondary"}
                      onClick={() => field.onChange("false")}
                    >
                      Show my name
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={field.value === "true" ? "primary" : "secondary"}
                      onClick={() => field.onChange("true")}
                    >
                      Stay anonymous
                    </Button>
                  </div>
                )}
              />
            </div>
          </div>

          <Button type="submit" disabled={mutation.isPending} className="w-fit">
            {mutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Submit for verification"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
