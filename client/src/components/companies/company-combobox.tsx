import * as React from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { CompanyTier } from "@placeprep/shared";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCompanies, useCreateCompany } from "@/hooks/use-companies";
import { useIsAdmin } from "@/hooks/use-profile";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TIERS: { value: CompanyTier; label: string }[] = [
  { value: "dream", label: "Dream" },
  { value: "super-dream", label: "Super Dream" },
  { value: "core", label: "Core" },
  { value: "mass-recruiter", label: "Mass Recruiter" },
];

interface CompanyComboboxProps {
  /** The currently selected value -- a company id in `mode="id"`
   * (the common case: quiz config, resource submission, alumni profile all
   * store a real `companyId` foreign key), or a raw company name in
   * `mode="name"` (Question Authoring's `companyName` field is a plain
   * string the backend get-or-creates by name, not an id -- see that
   * form's own schema/docstring for why). */
  value: string;
  onChange: (value: string) => void;
  mode?: "id" | "name";
  placeholder?: string;
  /** Adds a small clear ("×") affordance for optional company fields
   * (Resource Submission, Alumni Profile) -- omitted for quiz config's
   * Company-wise mode, where a company is required once that mode is
   * selected. */
  allowClear?: boolean;
  id?: string;
}

/**
 * Phase 18, Part 4 -- Company Input UX. Replaces the plain `<select>` (quiz
 * config, resource submission, alumni profile) and the native
 * `<input list="...">` datalist (question authoring) that previously stood
 * in for "pick a company" everywhere in the app -- none of the four
 * supported fuzzy matching, keyboard navigation beyond a browser's native
 * (and wildly inconsistent-across-browsers) datalist/select behavior, or
 * any way to add a missing company without leaving the page.
 *
 * Admins see a "+ Create <name>" row when nothing matches (backed by the
 * real `POST /companies` this phase added); everyone else sees a plain
 * "Company not found" message instead, per the brief -- a student
 * shouldn't be offered an action they don't have permission to complete.
 */
export function CompanyCombobox({
  value,
  onChange,
  mode = "id",
  placeholder = "Search companies...",
  allowClear = false,
  id,
}: CompanyComboboxProps) {
  const { data } = useCompanies();
  const isAdmin = useIsAdmin();
  const createCompany = useCreateCompany();
  const [createDialogQuery, setCreateDialogQuery] = React.useState<string | null>(null);

  // The everyday company list a student would see is already
  // server-filtered to `status: "active"` (see companies.py) -- but an
  // admin's own `useCompanies()` call (no admin-only params passed here)
  // returns active + archived together, so this picker still only offers
  // live companies to attach new content to, same as a student would see.
  const companies = (data?.items ?? []).filter((c) => c.status === "active");

  const options = companies.map((company) => ({
    value: mode === "id" ? company.id : company.name,
    label: company.name,
    sublabel: company.industry || undefined,
  }));

  function handleCreated(name: string, resultValue: string) {
    onChange(resultValue);
    toast.success(`"${name}" added to the company directory.`);
    setCreateDialogQuery(null);
  }

  return (
    <>
      <div className="relative">
        <Combobox
          id={id}
          options={options}
          value={value || null}
          onChange={onChange}
          placeholder={placeholder}
          emptyMessage="Company not found."
          onCreateOption={isAdmin ? (query) => setCreateDialogQuery(query) : undefined}
          createLabel={(query) => `Create "${query}"`}
          className={cn(allowClear && value && "pr-8")}
        />
        {allowClear && value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear company"
            className="absolute right-8 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <Dialog open={createDialogQuery !== null} onOpenChange={(open) => !open && setCreateDialogQuery(null)}>
        <DialogContent>
          <CreateCompanyDialogBody
            initialName={createDialogQuery ?? ""}
            pending={createCompany.isPending}
            onCancel={() => setCreateDialogQuery(null)}
            onSubmit={(input) => {
              createCompany.mutate(input, {
                onSuccess: (company) => handleCreated(company.name, mode === "id" ? company.id : company.name),
                onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create company."),
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Exported so `AdminCompaniesPage`'s own "New Company" action reuses this
 * exact form instead of a second, duplicate copy of the same three fields. */
export function CreateCompanyDialogBody({
  initialName,
  pending,
  onCancel,
  onSubmit,
}: {
  initialName: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: { name: string; industry: string; tier: CompanyTier }) => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [industry, setIndustry] = React.useState("");
  const [tier, setTier] = React.useState<CompanyTier>("core");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !industry.trim()) return;
        onSubmit({ name: name.trim(), industry: industry.trim(), tier });
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Create company</DialogTitle>
        <DialogDescription>Adds this company to the directory so it can be attached right away.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="new-company-name">Name</Label>
        <Input id="new-company-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-company-industry">Industry</Label>
        <Input
          id="new-company-industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. Product-based, Core Engineering"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-company-tier">Tier</Label>
        <select
          id="new-company-tier"
          className={selectClass}
          value={tier}
          onChange={(e) => setTier(e.target.value as CompanyTier)}
        >
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name.trim() || !industry.trim()}>
          {pending ? "Creating..." : "Create company"}
        </Button>
      </div>
    </form>
  );
}
