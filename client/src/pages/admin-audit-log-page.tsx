import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import type { AuditAction, AuditLogEntry, AuditTargetType } from "@/hooks/use-admin";
import { useAdminAuditLogs } from "@/hooks/use-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 25;

const ACTIONS: AuditAction[] = [
  "pdf-approved",
  "pdf-rejected",
  "question-approved",
  "question-rejected",
  "question-edited",
  "question-merged",
  "question-deleted",
  "interview-experience-approved",
  "interview-experience-rejected",
  "interview-experience-edited",
  "interview-experience-deleted",
  "user-role-changed",
  "resource-approved",
  "resource-rejected",
  "resource-edited",
  "resource-deleted",
  "resource-bulk-approved",
  "resource-bulk-rejected",
  "resource-bulk-deleted",
  "alumni-verified",
  "alumni-rejected",
  "alumni-edited",
  "alumni-suspended",
  "alumni-verification-removed",
  "alumni-deleted",
  "alumni-manual-created",
  // Phase 15, Part 1 -- Question Lifecycle Management.
  "question-archived",
  "question-unarchived",
  "question-restored",
  "question-permanently-deleted",
  "question-bulk-updated",
  "question-bulk-approved",
  "question-bulk-rejected",
  "question-bulk-published",
  "question-bulk-archived",
  "question-bulk-unarchived",
  "question-bulk-restored",
  "question-bulk-deleted",
  "question-bulk-permanently-deleted",
];

const TARGET_TYPES: AuditTargetType[] = ["pdf", "question", "interview-experience", "user", "resource", "alumni"];

const ACTION_LABELS: Record<AuditAction, string> = {
  "pdf-approved": "Approved a PDF upload",
  "pdf-rejected": "Rejected a PDF upload",
  "question-approved": "Approved a question",
  "question-rejected": "Rejected a question",
  "question-edited": "Edited a question",
  "question-merged": "Merged a duplicate question",
  "question-deleted": "Deleted a question",
  "interview-experience-approved": "Approved an interview experience",
  "interview-experience-rejected": "Rejected an interview experience",
  "interview-experience-edited": "Edited an interview experience",
  "interview-experience-deleted": "Deleted an interview experience",
  "user-role-changed": "Changed a user's role",
  "resource-approved": "Approved a resource",
  "resource-rejected": "Rejected a resource",
  "resource-edited": "Edited a resource",
  "resource-deleted": "Deleted a resource",
  "resource-bulk-approved": "Bulk-approved resources",
  "resource-bulk-rejected": "Bulk-rejected resources",
  "resource-bulk-deleted": "Bulk-deleted resources",
  "alumni-verified": "Verified an alumnus",
  "alumni-rejected": "Rejected an alumni request",
  "alumni-edited": "Edited an alumni profile",
  "alumni-suspended": "Suspended an alumnus",
  "alumni-verification-removed": "Removed an alumnus's verification",
  "alumni-deleted": "Deleted an alumni profile",
  "alumni-manual-created": "Manually verified an alumnus",
  // Phase 15, Part 1 -- Question Lifecycle Management.
  "question-archived": "Archived a question",
  "question-unarchived": "Unarchived a question",
  "question-restored": "Restored a deleted question",
  "question-permanently-deleted": "Permanently deleted a question",
  "question-bulk-updated": "Bulk-updated questions",
  "question-bulk-approved": "Bulk-approved questions",
  "question-bulk-rejected": "Bulk-rejected questions",
  "question-bulk-published": "Bulk-published questions",
  "question-bulk-archived": "Bulk-archived questions",
  "question-bulk-unarchived": "Bulk-unarchived questions",
  "question-bulk-restored": "Bulk-restored questions",
  "question-bulk-deleted": "Bulk-deleted questions",
  "question-bulk-permanently-deleted": "Bulk-permanently-deleted questions",
};

const ACTION_BADGE_VARIANT: Record<AuditAction, "correct" | "incorrect" | "accent" | "warning" | "neutral"> = {
  "pdf-approved": "correct",
  "pdf-rejected": "incorrect",
  "question-approved": "correct",
  "question-rejected": "incorrect",
  "question-edited": "accent",
  "question-merged": "accent",
  "question-deleted": "incorrect",
  "interview-experience-approved": "correct",
  "interview-experience-rejected": "incorrect",
  "interview-experience-edited": "accent",
  "interview-experience-deleted": "incorrect",
  "user-role-changed": "warning",
  "resource-approved": "correct",
  "resource-rejected": "incorrect",
  "resource-edited": "accent",
  "resource-deleted": "incorrect",
  "resource-bulk-approved": "correct",
  "resource-bulk-rejected": "incorrect",
  "resource-bulk-deleted": "incorrect",
  "alumni-verified": "correct",
  "alumni-rejected": "incorrect",
  "alumni-edited": "accent",
  "alumni-suspended": "warning",
  "alumni-verification-removed": "warning",
  "alumni-deleted": "incorrect",
  "alumni-manual-created": "correct",
  // Phase 15, Part 1 -- Question Lifecycle Management.
  "question-archived": "warning",
  "question-unarchived": "accent",
  "question-restored": "accent",
  "question-permanently-deleted": "incorrect",
  "question-bulk-updated": "accent",
  "question-bulk-approved": "correct",
  "question-bulk-rejected": "incorrect",
  "question-bulk-published": "correct",
  "question-bulk-archived": "warning",
  "question-bulk-unarchived": "accent",
  "question-bulk-restored": "accent",
  "question-bulk-deleted": "incorrect",
  "question-bulk-permanently-deleted": "incorrect",
};

const TARGET_LINK: Record<AuditTargetType, string | undefined> = {
  pdf: "/pdfs",
  question: "/admin/review",
  "interview-experience": "/experiences",
  user: "/admin",
  resource: "/admin/resources",
  alumni: "/admin/alumni",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMetadata(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return "—";
  return entries
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join(" · ");
}

function LogRow({ entry }: { entry: AuditLogEntry }) {
  const targetHref = TARGET_LINK[entry.targetType];
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell>
      <TableCell className="font-medium text-foreground">{entry.adminName}</TableCell>
      <TableCell>
        <Badge variant={ACTION_BADGE_VARIANT[entry.action]}>{ACTION_LABELS[entry.action]}</Badge>
      </TableCell>
      <TableCell className="max-w-xs truncate text-muted-foreground" title={formatMetadata(entry.metadata)}>
        {formatMetadata(entry.metadata)}
      </TableCell>
      <TableCell>
        {targetHref ? (
          <Link to={targetHref} className="text-sm text-primary hover:underline">
            View
          </Link>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

/**
 * Admin Portal Expansion, Module 2 -- Audit Log. Read-only view over
 * `admin_audit_logs` (migration 0010); every write happens as a side
 * effect of the actions that already exist elsewhere (pdfs.py, questions.py,
 * interview_experiences.py, admin.py's role-change endpoint) via
 * `app/services/audit.py`. See PROJECT_STATE.md for the full module writeup.
 */
export function AdminAuditLogPage() {
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState<AuditAction | undefined>(undefined);
  const [targetType, setTargetType] = React.useState<AuditTargetType | undefined>(undefined);

  const { data, isLoading, isError, refetch } = useAdminAuditLogs({
    page,
    pageSize: PAGE_SIZE,
    action,
    targetType,
  });

  const entries = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Every moderation action and role change, in order.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={action ?? ""}
              onChange={(e) => {
                setAction((e.target.value || undefined) as AuditAction | undefined);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All actions</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a]}
                </option>
              ))}
            </select>
            <select
              value={targetType ?? ""}
              onChange={(e) => {
                setTargetType((e.target.value || undefined) as AuditTargetType | undefined);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm capitalize text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All target types</option>
              {TARGET_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState description="We couldn't load the audit log." onRetry={() => refetch()} />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No matching activity"
              description="Try a different action or target type filter."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <LogRow key={entry.id} entry={entry} />
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="size-3.5" />
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
