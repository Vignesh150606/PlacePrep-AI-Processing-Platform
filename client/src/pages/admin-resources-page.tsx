import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Pencil, ShieldCheck, Trash2, XCircle } from "lucide-react";
import type { ModerationStatus, Resource } from "@placeprep/shared";
import { RESOURCE_CATEGORIES } from "@placeprep/shared";
import {
  useBulkResourceAction,
  useDeleteResource,
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
import { formatRelativeTime } from "@/lib/format";

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
  const [reason, setReason] = useState("");
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
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

export function AdminResourcesPage() {
  const [statusFilter, setStatusFilter] = useState<ModerationStatus>("pending-review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [editing, setEditing] = useState<Resource | null>(null);

  const { data, isLoading, isError, refetch } = useResources({ status: statusFilter, pageSize: 100 });
  const updateStatus = useUpdateResourceStatus();
  const remove = useDeleteResource();
  const bulkAction = useBulkResourceAction();

  const resources = data?.items ?? [];

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

  function runBulk(action: "approve" | "reject" | "delete") {
    if (selected.size === 0) return;
    if (action === "reject") {
      const reason = window.prompt("Rejection reason (applies to all selected resources):");
      if (!reason) return;
      bulkAction.mutate(
        { resourceIds: Array.from(selected), action, rejectionReason: reason },
        {
          onSuccess: (result) => {
            toast.success(`${result.succeeded.length} resource(s) rejected.`);
            setSelected(new Set());
          },
        },
      );
      return;
    }
    bulkAction.mutate(
      { resourceIds: Array.from(selected), action },
      {
        onSuccess: (result) => {
          toast.success(`${result.succeeded.length} resource(s) ${action}d.`);
          setSelected(new Set());
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Pending Resources</h1>
        <p className="text-sm text-muted-foreground">
          Review resources submitted to the Resource Library before they're published.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectClass}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ModerationStatus);
            setSelected(new Set());
          }}
        >
          <option value="pending-review">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-1.5">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button size="sm" onClick={() => runBulk("approve")} disabled={bulkAction.isPending}>
              <CheckCircle2 className="size-3.5" /> Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => runBulk("reject")}
              disabled={bulkAction.isPending}
            >
              <XCircle className="size-3.5" /> Reject
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => runBulk("delete")}
              disabled={bulkAction.isPending}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load the resource queue." onRetry={() => refetch()} />
      ) : resources.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing here"
          description={
            statusFilter === "pending-review"
              ? "No resources are waiting for review right now."
              : `No ${statusFilter} resources.`
          }
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
                        {RESOURCE_CATEGORIES.find((c) => c.value === resource.category)?.label ??
                          resource.category}
                      </Badge>
                      {resource.difficulty && <DifficultyBadge difficulty={resource.difficulty} />}
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
                  {resource.status !== "approved" && (
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
                  <Button variant="secondary" size="sm" onClick={() => setEditing(resource)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  {resource.status !== "rejected" && (
                    <Button variant="secondary" size="sm" onClick={() => setRejecting(resource.id)}>
                      <XCircle className="size-3.5" />
                      Reject
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`Delete "${resource.title}"? This can't be undone.`)) {
                        remove.mutate(resource.id, { onSuccess: () => toast.success("Resource deleted.") });
                      }
                    }}
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

      {rejecting && (
        <RejectDialog resourceId={rejecting} open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)} />
      )}
      <EditResourceDialog resource={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />
    </div>
  );
}
