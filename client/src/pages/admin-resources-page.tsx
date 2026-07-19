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
  Trash2,
  XCircle,
} from "lucide-react";
import type { Resource, ResourceBulkActionType, ResourceBulkUpdateInput, ResourceCategory, ResourceLifecycleStatus } from "@placeprep/shared";
import { RESOURCE_CATEGORIES } from "@placeprep/shared";
import {
  useBulkResourceAction,
  useBulkUpdateResources,
  useDeleteResource,
  useResourceLifecycle,
  useResources,
  useUpdateResource,
  useUpdateResourceStatus,
} from "@/hooks/use-resources";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchBar } from "@/components/ui/search-bar";
import { formatRelativeTime } from "@/lib/format";

const PAGE_SIZE = 20;
const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function RejectDialog({
  resourceId,
  open,
  onOpenChange,
}: {
  resourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = React.useState("");
  const updateStatus = useUpdateResourceStatus();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this resource</DialogTitle>
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
                { resourceId, status: "rejected", rejectionReason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success("Resource rejected.");
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

function EditResourceDialog({
  resource,
  open,
  onOpenChange,
}: {
  resource: Resource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateResource();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [tags, setTags] = React.useState("");

  React.useEffect(() => {
    if (resource) {
      setTitle(resource.title);
      setDescription(resource.description ?? "");
      setCategory(resource.category);
      setTags(resource.tags.join(", "));
    }
  }, [resource]);

  if (!resource) return null;

  function handleSave() {
    if (!resource) return;
    update.mutate(
      {
        resourceId: resource.id,
        title: title || undefined,
        description,
        category: category as Resource["category"],
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      },
      {
        onSuccess: () => {
          toast.success("Resource updated.");
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
          <DialogTitle>Edit resource</DialogTitle>
          <DialogDescription>Changes are visible immediately and bump the revision counter.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-resource-title">Title</Label>
            <Input id="edit-resource-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-resource-description">Description</Label>
            <textarea
              id="edit-resource-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-resource-category">Category</Label>
            <select
              id="edit-resource-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={selectClass}
            >
              {RESOURCE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-resource-tags">Tags (comma-separated)</Label>
            <Input id="edit-resource-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={update.isPending} className="w-fit">
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Feature 1's "Bulk Category Update" / "Bulk Tag Update" -- one form, one
 * endpoint, mirroring admin-review-page.tsx's `BulkUpdateDialog` (just two
 * fields here -- a resource has no subject/topic/company/difficulty bulk
 * fields the way a question does). Every field starts blank ("don't
 * change"); only the ones the admin actually fills in get sent. */
function BulkUpdateDialog({
  resourceIds,
  open,
  onOpenChange,
}: {
  resourceIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const bulkUpdate = useBulkUpdateResources();
  const [category, setCategory] = React.useState("");
  const [addTags, setAddTags] = React.useState("");

  function reset() {
    setCategory("");
    setAddTags("");
  }

  function handleApply() {
    const input: ResourceBulkUpdateInput = { resourceIds };
    if (category) input.category = category as ResourceCategory;
    const tags = addTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length) input.addTags = tags;

    if (!input.category && !input.addTags) {
      toast.error("Set at least one field to update.");
      return;
    }

    bulkUpdate.mutate(input, {
      onSuccess: (result) => {
        toast.success(
          `${result.succeeded.length} resource(s) updated${result.failed.length ? `, ${result.failed.length} failed` : ""}.`,
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
          <DialogTitle>Bulk edit {resourceIds.length} resource(s)</DialogTitle>
          <DialogDescription>Only the fields you set below are changed -- leave the rest blank.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-resource-category">Category</Label>
            <select
              id="bulk-resource-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={selectClass}
            >
              <option value="">Don't change</option>
              {RESOURCE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-resource-tags">Add tags (comma-separated)</Label>
            <Input
              id="bulk-resource-tags"
              placeholder="e.g. must-read, 2026"
              value={addTags}
              onChange={(e) => setAddTags(e.target.value)}
            />
          </div>
          <Button onClick={handleApply} disabled={bulkUpdate.isPending} className="w-fit">
            Apply to {resourceIds.length} resource(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TabState {
  label: string;
  status: ResourceLifecycleStatus | "";
  deleted: boolean;
}

/** Feature 1's lifecycle diagram as tabs -- same shape as
 * admin-review-page.tsx's `TABS` (no "Drafts" tab here: a resource is
 * never manually drafted the way an admin-authored question can be). */
const TABS: TabState[] = [
  { label: "Pending review", status: "pending-review", deleted: false },
  { label: "Approved", status: "approved", deleted: false },
  { label: "Archived", status: "archived", deleted: false },
  { label: "Rejected", status: "rejected", deleted: false },
  { label: "Deleted", status: "", deleted: true },
];

const CATEGORY_FILTERS: Array<{ label: string; value: ResourceCategory | undefined }> = [
  { label: "All categories", value: undefined },
  ...RESOURCE_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
];

/**
 * Phase 15, Part 2 (Slice A) -- Resource Lifecycle Management (Feature 1) +
 * Feature 9's admin UX consistency. This used to be a single pending-review
 * queue loading up to 100 resources with no pagination and no search; it's
 * now every resource, in every lifecycle state, with search + category
 * filter + real pagination + multi-select + bulk actions + bulk field edits
 * + soft delete/restore/archive -- the same shape `AdminReviewPage` (Manage
 * Questions) already established in Part 1, reused rather than reinvented.
 */
export function AdminResourcesPage() {
  const [tab, setTab] = React.useState<TabState>(TABS[0]);
  const [category, setCategory] = React.useState<ResourceCategory | undefined>(undefined);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Resource | null>(null);
  const [bulkEditing, setBulkEditing] = React.useState(false);

  // Same local-debounce shape as admin-review-page.tsx's search box -- no
  // shared debounce hook exists in this codebase yet.
  React.useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = useResources({
    status: tab.deleted ? undefined : tab.status || undefined,
    deleted: tab.deleted,
    category,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const updateStatus = useUpdateResourceStatus();
  const remove = useDeleteResource();
  const { archive, unarchive, restore, permanentDelete } = useResourceLifecycle();
  const bulkAction = useBulkResourceAction();

  const resources = data?.items ?? [];
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
    setSelected((prev) => (prev.size === resources.length ? new Set() : new Set(resources.map((r) => r.id))));
  }

  function handleDelete(resource: Resource) {
    if (!window.confirm(`Delete "${resource.title}"? It can be restored from the Deleted tab.`)) return;
    remove.mutate(resource.id, { onSuccess: () => toast.success("Resource deleted.") });
  }

  function handlePermanentDelete(resource: Resource) {
    if (!window.confirm(`Permanently delete "${resource.title}"? This CANNOT be undone.`)) return;
    permanentDelete.mutate(resource.id, { onSuccess: () => toast.success("Resource permanently deleted.") });
  }

  function runUndo(action: ResourceBulkActionType, ids: string[]) {
    bulkAction.mutate(
      { resourceIds: ids, action },
      { onSuccess: (result) => toast.success(`${result.succeeded.length} resource(s) undone.`) },
    );
  }

  function runBulk(action: ResourceBulkActionType) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    if (action === "reject") {
      const reason = window.prompt("Rejection reason (applies to all selected resources):");
      if (!reason) return;
      bulkAction.mutate(
        { resourceIds: ids, action, rejectionReason: reason },
        {
          onSuccess: (result) => {
            toast.success(
              `${result.succeeded.length} resource(s) rejected${result.failed.length ? `, ${result.failed.length} failed` : ""}.`,
            );
            setSelected(new Set());
          },
        },
      );
      return;
    }

    if (
      action === "delete" &&
      !window.confirm(`Delete ${ids.length} resource(s)? They can be restored from the Deleted tab.`)
    ) {
      return;
    }
    if (
      action === "permanent-delete" &&
      !window.confirm(`Permanently delete ${ids.length} resource(s)? This CANNOT be undone.`)
    ) {
      return;
    }

    bulkAction.mutate(
      { resourceIds: ids, action },
      {
        onSuccess: (result) => {
          const failedSuffix = result.failed.length ? `, ${result.failed.length} failed` : "";
          toast.success(`${result.succeeded.length} resource(s) updated${failedSuffix}.`, {
            action: result.undoAction
              ? {
                  label: "Undo",
                  onClick: () => runUndo(result.undoAction as ResourceBulkActionType, result.succeeded),
                }
              : undefined,
          });
          setSelected(new Set());
        },
        onError: () => toast.error("Bulk action failed."),
      },
    );
  }

  const showApproveReject = !tab.deleted && (tab.status === "pending-review" || tab.status === "");
  const showArchive = !tab.deleted && tab.status === "approved";
  const showUnarchive = !tab.deleted && tab.status === "archived";
  const showRestore = tab.deleted;
  const showPermanentDelete = tab.deleted;
  const showDelete = !tab.deleted;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Manage Resources</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${total} resource${total === 1 ? "" : "s"} — ${tab.label.toLowerCase()}.`}
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchBar
            placeholder="Search resource titles…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            containerClassName="sm:max-w-xs"
          />
          <select
            className={selectClass}
            value={category ?? ""}
            onChange={(e) => {
              setCategory((e.target.value || undefined) as ResourceCategory | undefined);
              setPage(1);
            }}
          >
            {CATEGORY_FILTERS.map((f) => (
              <option key={f.label} value={f.value ?? ""}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

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
              <Button
                variant="destructive"
                size="sm"
                onClick={() => runBulk("permanent-delete")}
                disabled={bulkAction.isPending}
              >
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
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load these resources." onRetry={() => refetch()} />
      ) : resources.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing here"
          description={tab.deleted ? "No deleted resources." : `No resources are currently ${tab.label.toLowerCase()}.`}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={selected.size === resources.length}
              onChange={toggleSelectAll}
              className="size-3.5 rounded border-border"
            />
            Select all
          </label>

          {resources.map((resource) => (
            <Card key={resource.id} className="p-5">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(resource.id)}
                    onChange={() => toggleSelected(resource.id)}
                    className="mt-1 size-3.5 rounded border-border"
                    aria-label={`Select ${resource.title}`}
                  />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="accent">
                        {RESOURCE_CATEGORIES.find((c) => c.value === resource.category)?.label ?? resource.category}
                      </Badge>
                      {resource.difficulty && <DifficultyBadge difficulty={resource.difficulty} />}
                      <Badge variant="neutral" className="capitalize">
                        {resource.status.replace("-", " ")}
                      </Badge>
                      {resource.deletedAt && (
                        <Badge variant="incorrect">Deleted {formatRelativeTime(resource.deletedAt)}</Badge>
                      )}
                      {resource.subjectName && <Badge variant="neutral">{resource.subjectName}</Badge>}
                      {resource.companyName && <Badge variant="neutral">{resource.companyName}</Badge>}
                      <span className="text-xs text-muted-foreground">
                        Submitted by {resource.uploaderName ?? "Unknown"} · {formatRelativeTime(resource.uploadedAt)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{resource.title}</p>
                    {resource.description && (
                      <p className="text-sm text-muted-foreground">{resource.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {resource.externalUrl ? `Link: ${resource.externalUrl}` : `File: ${resource.fileName}`}
                    </p>
                    {resource.status === "rejected" && resource.rejectionReason && (
                      <p className="text-xs text-incorrect-600">Rejected: {resource.rejectionReason}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
                  {!resource.deletedAt && resource.status === "pending-review" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateStatus.mutate(
                          { resourceId: resource.id, status: "approved" },
                          { onSuccess: () => toast.success("Approved — now visible in the Resource Library.") },
                        )
                      }
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle2 className="size-3.5" />
                      Approve
                    </Button>
                  )}
                  {!resource.deletedAt && resource.status === "pending-review" && (
                    <Button variant="secondary" size="sm" onClick={() => setRejecting(resource.id)}>
                      <XCircle className="size-3.5" />
                      Reject
                    </Button>
                  )}
                  {!resource.deletedAt && resource.status === "approved" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        archive.mutate(resource.id, { onSuccess: () => toast.success("Resource archived.") })
                      }
                      disabled={archive.isPending}
                    >
                      <Archive className="size-3.5" />
                      Archive
                    </Button>
                  )}
                  {!resource.deletedAt && resource.status === "archived" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        unarchive.mutate(resource.id, { onSuccess: () => toast.success("Resource unarchived.") })
                      }
                      disabled={unarchive.isPending}
                    >
                      <ArchiveRestore className="size-3.5" />
                      Unarchive
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setEditing(resource)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  {resource.deletedAt ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          restore.mutate(resource.id, { onSuccess: () => toast.success("Resource restored.") })
                        }
                        disabled={restore.isPending}
                      >
                        <RotateCcw className="size-3.5" />
                        Restore
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handlePermanentDelete(resource)}
                        disabled={permanentDelete.isPending}
                      >
                        <Trash2 className="size-3.5" />
                        Delete permanently
                      </Button>
                    </>
                  ) : (
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(resource)} disabled={remove.isPending}>
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  )}
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

      {rejecting && (
        <RejectDialog resourceId={rejecting} open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)} />
      )}
      <EditResourceDialog resource={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />
      <BulkUpdateDialog resourceIds={Array.from(selected)} open={bulkEditing} onOpenChange={setBulkEditing} />
    </div>
  );
}
