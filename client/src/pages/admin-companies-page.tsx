import * as React from "react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Building2,
  GitMerge,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { Company, CompanyBulkActionType, CompanyTier } from "@placeprep/shared";
import {
  useAdminCompanies,
  useBulkCompanyAction,
  useCompanyLifecycle,
  useCreateCompany,
  useMergeCompanies,
  useUpdateCompany,
} from "@/hooks/use-companies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchBar } from "@/components/ui/search-bar";
import { CompanyCombobox, CreateCompanyDialogBody } from "@/components/companies/company-combobox";
import { formatRelativeTime } from "@/lib/format";
import { ApiError } from "@/lib/api-client";

const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const TIER_LABEL: Record<CompanyTier, string> = {
  dream: "Dream",
  "super-dream": "Super Dream",
  core: "Core",
  "mass-recruiter": "Mass Recruiter",
};

interface TabState {
  label: string;
  status: "active" | "archived" | "";
  deleted: boolean;
}

/** Deliberately just three tabs, not the five `AdminResourcesPage` has --
 * a company never goes through a review queue (no Pending/Rejected state
 * exists for it), so Active / Archived / Deleted is the complete lifecycle
 * migration 0021 actually models. */
const TABS: TabState[] = [
  { label: "Active", status: "active", deleted: false },
  { label: "Archived", status: "archived", deleted: false },
  { label: "Deleted", status: "", deleted: true },
];

/**
 * Phase 18 -- Company Admin Management (Part 3 of the UX brief this pass
 * addresses: create/edit/archive/restore/permanent-delete/merge/bulk
 * archive/bulk delete). Before this phase, `companies.py` was read-only --
 * see that module's docstring history -- so this page, the backing
 * endpoints, and the migration adding the lifecycle columns are all new
 * this pass, not a redesign of something that already existed.
 */
export function AdminCompaniesPage() {
  const [tab, setTab] = React.useState<TabState>(TABS[0]);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Company | null>(null);
  const [merging, setMerging] = React.useState<Company | null>(null);

  // Same local-debounce shape `AdminResourcesPage`'s search box already
  // uses -- no shared debounce hook exists in this codebase yet.
  React.useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = useAdminCompanies({
    status: tab.deleted ? undefined : (tab.status as "active" | "archived"),
    deleted: tab.deleted,
  });
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const { archive, unarchive, softDelete, restore, permanentDelete } = useCompanyLifecycle();
  const bulkAction = useBulkCompanyAction();
  const mergeCompanies = useMergeCompanies();

  const allCompanies = data?.items ?? [];
  const companies = search
    ? allCompanies.filter(
        (c) => c.name.toLowerCase().includes(search) || c.industry.toLowerCase().includes(search),
      )
    : allCompanies;

  function switchTab(next: TabState) {
    setTab(next);
    setSelected(new Set());
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
    setSelected((prev) => (prev.size === companies.length ? new Set() : new Set(companies.map((c) => c.id))));
  }

  function runUndo(action: CompanyBulkActionType, ids: string[]) {
    bulkAction.mutate(
      { companyIds: ids, action },
      { onSuccess: (result) => toast.success(`${result.succeeded.length} compan${result.succeeded.length === 1 ? "y" : "ies"} undone.`) },
    );
  }

  function runBulk(action: CompanyBulkActionType) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    if (action === "delete" && !window.confirm(`Delete ${ids.length} compan${ids.length === 1 ? "y" : "ies"}? They can be restored from the Deleted tab.`)) {
      return;
    }
    if (action === "permanent-delete" && !window.confirm(`Permanently delete ${ids.length} compan${ids.length === 1 ? "y" : "ies"}? This CANNOT be undone.`)) {
      return;
    }

    bulkAction.mutate(
      { companyIds: ids, action },
      {
        onSuccess: (result) => {
          const failedSuffix = result.failed.length ? `, ${result.failed.length} failed` : "";
          toast.success(`${result.succeeded.length} compan${result.succeeded.length === 1 ? "y" : "ies"} updated${failedSuffix}.`, {
            action: result.undoAction
              ? { label: "Undo", onClick: () => runUndo(result.undoAction as CompanyBulkActionType, result.succeeded) }
              : undefined,
          });
          setSelected(new Set());
        },
        onError: () => toast.error("Bulk action failed."),
      },
    );
  }

  function handleArchive(company: Company) {
    archive.mutate(company.id, { onSuccess: () => toast.success(`"${company.name}" archived.`) });
  }
  function handleUnarchive(company: Company) {
    unarchive.mutate(company.id, { onSuccess: () => toast.success(`"${company.name}" unarchived.`) });
  }
  function handleDelete(company: Company) {
    if (!window.confirm(`Delete "${company.name}"? It can be restored from the Deleted tab.`)) return;
    softDelete.mutate(company.id, { onSuccess: () => toast.success("Company deleted.") });
  }
  function handleRestore(company: Company) {
    restore.mutate(company.id, { onSuccess: () => toast.success(`"${company.name}" restored.`) });
  }
  function handlePermanentDelete(company: Company) {
    if (!window.confirm(`Permanently delete "${company.name}"? This CANNOT be undone.`)) return;
    permanentDelete.mutate(company.id, { onSuccess: () => toast.success("Company permanently deleted.") });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Manage Companies</h1>
          <p className="text-sm text-muted-foreground">
            Create, edit, archive, and merge companies in the directory.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New Company
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => switchTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab.label === t.label
                ? "border-accent-600 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <SearchBar
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search by name or industry..."
        containerClassName="max-w-sm"
      />

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent-600/30 bg-accent-600/5 px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {!tab.deleted && tab.status === "active" && (
              <Button size="sm" variant="secondary" onClick={() => runBulk("archive")}>
                <Archive className="size-3.5" />
                Archive
              </Button>
            )}
            {!tab.deleted && tab.status === "archived" && (
              <Button size="sm" variant="secondary" onClick={() => runBulk("unarchive")}>
                <ArchiveRestore className="size-3.5" />
                Unarchive
              </Button>
            )}
            {!tab.deleted ? (
              <Button size="sm" variant="destructive" onClick={() => runBulk("delete")}>
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => runBulk("restore")}>
                  <RotateCcw className="size-3.5" />
                  Restore
                </Button>
                <Button size="sm" variant="destructive" onClick={() => runBulk("permanent-delete")}>
                  <Trash2 className="size-3.5" />
                  Delete permanently
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load companies." onRetry={() => refetch()} />
      ) : companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={tab.deleted ? "Nothing in the Deleted tab" : `No ${tab.label.toLowerCase()} companies`}
          description={search ? "No companies match your search." : undefined}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selected.size === companies.length}
                  onChange={toggleSelectAll}
                  className="size-4 rounded border-border"
                />
              </TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select ${company.name}`}
                    checked={selected.has(company.id)}
                    onChange={() => toggleSelected(company.id)}
                    className="size-4 rounded border-border"
                  />
                </TableCell>
                <TableCell>
                  <p className="font-medium">{company.name}</p>
                  <p className="text-xs text-muted-foreground">{company.industry}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={company.tier === "core" ? "warning" : "accent"}>{TIER_LABEL[company.tier]}</Badge>
                </TableCell>
                <TableCell>{company.questionCount}</TableCell>
                <TableCell>
                  <Badge variant={company.status === "active" ? "correct" : "neutral"} className="capitalize">
                    {tab.deleted ? "Deleted" : company.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatRelativeTime(company.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {!tab.deleted && (
                      <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(company)}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {!tab.deleted && tab.status === "active" && (
                      <>
                        <Button variant="ghost" size="icon" aria-label="Merge into another company" onClick={() => setMerging(company)}>
                          <GitMerge className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Archive" onClick={() => handleArchive(company)}>
                          <Archive className="size-4" />
                        </Button>
                      </>
                    )}
                    {!tab.deleted && tab.status === "archived" && (
                      <Button variant="ghost" size="icon" aria-label="Unarchive" onClick={() => handleUnarchive(company)}>
                        <ArchiveRestore className="size-4" />
                      </Button>
                    )}
                    {!tab.deleted ? (
                      <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => handleDelete(company)}>
                        <Trash2 className="size-4 text-incorrect-500" />
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon" aria-label="Restore" onClick={() => handleRestore(company)}>
                          <RotateCcw className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Permanently delete" onClick={() => handlePermanentDelete(company)}>
                          <Trash2 className="size-4 text-incorrect-500" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <CreateCompanyDialogBody
            initialName=""
            pending={createCompany.isPending}
            onCancel={() => setCreating(false)}
            onSubmit={(input) =>
              createCompany.mutate(input, {
                onSuccess: (company) => {
                  toast.success(`"${company.name}" created.`);
                  setCreating(false);
                },
                onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create company."),
              })
            }
          />
        </DialogContent>
      </Dialog>

      {editing && (
        <EditCompanyDialog
          company={editing}
          pending={updateCompany.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(input) =>
            updateCompany.mutate(
              { companyId: editing.id, ...input },
              {
                onSuccess: () => {
                  toast.success("Company updated.");
                  setEditing(null);
                },
                onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update company."),
              },
            )
          }
        />
      )}

      {merging && (
        <MergeCompanyDialog
          duplicate={merging}
          pending={mergeCompanies.isPending}
          onCancel={() => setMerging(null)}
          onSubmit={(canonicalId) =>
            mergeCompanies.mutate(
              { canonicalId, duplicateId: merging.id },
              {
                onSuccess: (result) => {
                  toast.success(
                    `Merged "${merging.name}" -- ${result.questionLinksReassigned} question link(s), ${result.interviewExperiencesReassigned} experience(s) reassigned.`,
                  );
                  setMerging(null);
                },
                onError: (err) => toast.error(err instanceof ApiError ? err.message : "Merge failed."),
              },
            )
          }
        />
      )}
    </div>
  );
}

function EditCompanyDialog({
  company,
  pending,
  onCancel,
  onSubmit,
}: {
  company: Company;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: { name: string; industry: string; tier: CompanyTier; description: string; website: string }) => void;
}) {
  const [name, setName] = React.useState(company.name);
  const [industry, setIndustry] = React.useState(company.industry);
  const [tier, setTier] = React.useState<CompanyTier>(company.tier);
  const [description, setDescription] = React.useState(company.description);
  const [website, setWebsite] = React.useState(company.website ?? "");

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ name: name.trim(), industry: industry.trim(), tier, description: description.trim(), website: website.trim() });
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Edit company</DialogTitle>
            <DialogDescription>
              The slug ({company.slug}) stays the same -- it's referenced by bookmarks and quiz configs.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-company-name">Name</Label>
            <Input id="edit-company-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-company-industry">Industry</Label>
              <Input id="edit-company-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-company-tier">Tier</Label>
              <select
                id="edit-company-tier"
                className={selectClass}
                value={tier}
                onChange={(e) => setTier(e.target.value as CompanyTier)}
              >
                {(Object.keys(TIER_LABEL) as CompanyTier[]).map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-company-description">Description</Label>
            <textarea
              id="edit-company-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-20 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-company-website">Website</Label>
            <Input id="edit-company-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || !industry.trim()}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeCompanyDialog({
  duplicate,
  pending,
  onCancel,
  onSubmit,
}: {
  duplicate: Company;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (canonicalId: string) => void;
}) {
  const [canonicalId, setCanonicalId] = React.useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge "{duplicate.name}"</DialogTitle>
          <DialogDescription>
            Pick the company to keep. Every question link, interview experience, resource, alumni
            profile, community post, calendar event, and bookmark pointing at "{duplicate.name}" moves
            to it, and "{duplicate.name}" is removed from the active directory (recoverable from the
            Deleted tab).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="merge-target">Keep</Label>
          <CompanyCombobox id="merge-target" value={canonicalId} onChange={setCanonicalId} placeholder="Search companies..." />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canonicalId || canonicalId === duplicate.id || pending}
            onClick={() => onSubmit(canonicalId)}
          >
            {pending ? "Merging..." : "Merge"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
