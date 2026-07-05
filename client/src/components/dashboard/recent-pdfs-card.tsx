import { Link } from "@tanstack/react-router";
import { FileText, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { usePdfs } from "@/hooks/use-pdfs";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PdfProcessingStatus } from "@placeprep/shared";

const STATUS_CONFIG: Record<PdfProcessingStatus, { icon: typeof FileText; className: string; label: string }> = {
  uploaded: { icon: FileText, className: "text-muted-foreground", label: "Uploaded" },
  queued: { icon: Loader2, className: "text-warning-500", label: "Queued" },
  processing: { icon: Loader2, className: "text-accent-600 animate-spin", label: "Processing" },
  completed: { icon: CheckCircle2, className: "text-correct-600 dark:text-correct-500", label: "Completed" },
  failed: { icon: XCircle, className: "text-incorrect-600 dark:text-incorrect-500", label: "Failed" },
};

/**
 * FIX (major, from PROJECT_STATE.md's own known-debt list): this card read
 * `mocks/pdfs.ts` even after the real PDF Library page had a working
 * `usePdfs()` hook backed by the actual API — meaning a user's real recent
 * uploads never showed up on the dashboard. Swapped to the real hook, with
 * loading/error/empty states matching the rest of the app.
 */
export function RecentPdfsCard() {
  const { data, isLoading, isError } = usePdfs();

  const recent = [...(data?.items ?? [])]
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
    .slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent PDFs</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {isLoading ? (
          <div className="flex flex-col gap-2 py-1">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Couldn't load recent PDFs.</p>
        ) : recent.length === 0 ? (
          <EmptyState icon={FileText} title="No PDFs uploaded yet" className="border-none py-6" />
        ) : (
          recent.map((pdf) => {
            const status = STATUS_CONFIG[pdf.processingStatus];
            const StatusIcon = status.icon;
            return (
              <Link
                key={pdf.id}
                to="/pdfs"
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{pdf.fileName}</p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(pdf.uploadedAt)}</p>
                </div>
                <span className={cn("flex shrink-0 items-center gap-1 text-xs font-medium", status.className)}>
                  <StatusIcon className="size-3.5" />
                  {status.label}
                </span>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
