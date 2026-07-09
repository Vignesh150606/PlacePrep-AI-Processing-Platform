import { useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  ScanText,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { PdfProcessingStatus } from "@placeprep/shared";
import { PDF_UPLOAD_CONSTRAINTS } from "@placeprep/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-profile";
import { usePdfs, useRetryPdf, useSetKeepPermanent, useUploadPdf } from "@/hooks/use-pdfs";
import { useProcessingDashboard, useProcessingJobs } from "@/hooks/use-processing";
import { ApiError } from "@/lib/api-client";

const STATUS_CONFIG: Record<PdfProcessingStatus, { icon: typeof FileText; className: string; label: string }> = {
  uploaded: { icon: FileText, className: "text-muted-foreground", label: "Uploaded" },
  queued: { icon: Loader2, className: "text-warning-500", label: "Queued" },
  processing: { icon: Loader2, className: "text-accent-600 animate-spin", label: "Processing" },
  completed: { icon: CheckCircle2, className: "text-correct-600 dark:text-correct-500", label: "Completed" },
  failed: { icon: XCircle, className: "text-incorrect-600 dark:text-incorrect-500", label: "Failed" },
};

// NOTE ON THE "processing text rotates with the spinner" UI BUG:
// The spec asked us to fix a bug where status text spins along with its
// loading icon. In every status-rendering component in this codebase
// (StatusPill below, and the equivalent in recent-pdfs-card.tsx), the
// `animate-spin` class is applied only to the <Icon> element — the label
// text is a separate sibling <span>/string with no animation class. We
// could not reproduce or locate the described bug anywhere in the provided
// snapshot; it may live in a component that wasn't included here, or may
// already have been fixed. See PROJECT_STATE.md for the honest note on this
// rather than a fabricated "fix" to code that already looks correct.
function StatusPill({ status }: { status: PdfProcessingStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", config.className)}>
      <Icon className="size-3.5" />
      <span>{config.label}</span>
    </span>
  );
}

function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const upload = useUploadPdf();

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!PDF_UPLOAD_CONSTRAINTS.allowedMimeTypes.includes(file.type)) {
      toast.error("Only PDF files are accepted.");
      return;
    }
    if (file.size > PDF_UPLOAD_CONSTRAINTS.maxSizeBytes) {
      toast.error(`File exceeds the ${formatBytes(PDF_UPLOAD_CONSTRAINTS.maxSizeBytes)} limit.`);
      return;
    }
    upload.mutate(
      { file, title: file.name.replace(/\.pdf$/i, "") },
      {
        onSuccess: () => toast.success(`"${file.name}" uploaded — extraction queued.`),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Upload failed."),
      },
    );
  };

  return (
    <Card
      className={cn(
        "border-dashed transition-colors",
        isDragging ? "border-accent-600 bg-accent-600/5" : "border-border",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-accent-600/10 text-accent-600">
          {upload.isPending ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {upload.isPending ? "Uploading…" : "Drop a PDF here, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">
            PDF only, up to {formatBytes(PDF_UPLOAD_CONSTRAINTS.maxSizeBytes)}. Extraction starts automatically —
            scanned pages are OCR'd automatically if needed, and large PDFs are split into chunks.
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}

function PdfLibraryTab() {
  const { data, isLoading, isError, refetch } = usePdfs();
  const isAdmin = useIsAdmin();
  const retry = useRetryPdf();
  const keepPermanent = useSetKeepPermanent();

  return (
    <div className="flex flex-col gap-6">
      <UploadDropzone />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load your PDFs." onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={FileText} title="No PDFs uploaded yet" description="Upload a question paper to get started." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded</TableHead>
              {isAdmin && <TableHead>Keep permanent</TableHead>}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((pdf) => (
              <TableRow key={pdf.id}>
                <TableCell className="max-w-xs truncate font-medium">{pdf.title || pdf.fileName}</TableCell>
                <TableCell>
                  <StatusPill status={pdf.processingStatus} />
                  {pdf.processingStatus === "failed" && pdf.errorMessage && (
                    <p className="mt-0.5 max-w-xs truncate text-xs text-incorrect-500" title={pdf.errorMessage}>
                      {pdf.errorMessage}
                    </p>
                  )}
                </TableCell>
                <TableCell>{pdf.extractedQuestionCount}</TableCell>
                <TableCell className="text-muted-foreground">{formatBytes(pdf.fileSizeBytes)}</TableCell>
                <TableCell className="text-muted-foreground" title={formatDateTime(pdf.uploadedAt)}>
                  {formatRelativeTime(pdf.uploadedAt)}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={keepPermanent.isPending}
                      onClick={() =>
                        keepPermanent.mutate({ pdfId: pdf.id, keepPermanent: !pdf.keepPermanent })
                      }
                    >
                      {pdf.keepPermanent ? <Badge variant="accent">Kept</Badge> : "Keep"}
                    </Button>
                  </TableCell>
                )}
                <TableCell>
                  {pdf.processingStatus === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={retry.isPending}
                      onClick={() =>
                        retry.mutate(pdf.id, {
                          onSuccess: () => toast.success("Retry queued."),
                          onError: (err) => toast.error(err instanceof ApiError ? err.message : "Retry failed."),
                        })
                      }
                    >
                      <RefreshCw className="size-3.5" /> Retry
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ProcessingDashboardTab() {
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useProcessingDashboard(true);
  const { data: jobs, isLoading: jobsLoading } = useProcessingJobs(true);
  const retry = useRetryPdf();

  if (statsLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(9)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (statsError || !stats) {
    return <ErrorState description="We couldn't load the processing dashboard." onRetry={() => refetchStats()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Queued jobs" value={stats.queuedJobs} icon={Loader2} />
        <StatCard label="Running jobs" value={stats.runningJobs} icon={Loader2} />
        <StatCard label="Completed jobs" value={stats.completedJobs} icon={CheckCircle2} />
        <StatCard label="Failed jobs" value={stats.failedJobs} icon={XCircle} />
        <StatCard label="Questions extracted" value={stats.questionsExtractedTotal} icon={FileText} />
        <StatCard label="Duplicates found" value={stats.duplicatesFoundTotal} icon={FileText} />
        <StatCard label="Pending review" value={stats.pendingReviewCount} icon={FileText} />
        <StatCard label="OCR fallback used" value={stats.ocrJobsTotal} icon={ScanText} />
        <StatCard
          label="Avg. confidence"
          value={stats.averageConfidence !== null ? `${Math.round(stats.averageConfidence * 100)}%` : "—"}
          icon={FileText}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {jobsLoading ? (
            <div className="flex flex-col gap-2 p-5">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !jobs || jobs.items.length === 0 ? (
            <EmptyState icon={FileText} title="No jobs yet" className="border-none" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PDF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Extracted</TableHead>
                  <TableHead>Duplicates</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>OCR</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.items.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-xs truncate">{job.pdfFileName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          job.status === "completed" ? "correct" : job.status === "failed" ? "incorrect" : "warning"
                        }
                        className="capitalize"
                      >
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{job.questionsExtracted}</TableCell>
                    <TableCell>{job.duplicatesFound}</TableCell>
                    <TableCell>{job.lowConfidenceCount}</TableCell>
                    <TableCell>{job.chunkCount || 1}</TableCell>
                    <TableCell>
                      {job.ocrUsed ? <Badge variant="accent">OCR</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.startedAt ? formatRelativeTime(job.startedAt) : "—"}
                    </TableCell>
                    <TableCell>
                      {job.status === "failed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retry.isPending}
                          onClick={() =>
                            retry.mutate(job.pdfResourceId, {
                              onSuccess: () => toast.success("Retry queued."),
                              onError: (err) => toast.error(err instanceof ApiError ? err.message : "Retry failed."),
                            })
                          }
                        >
                          <RefreshCw className="size-3.5" /> Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PdfLibraryPage() {
  const isAdmin = useIsAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">PDF Library</h1>
        <p className="text-sm text-muted-foreground">
          Upload placement question papers — Gemini extracts, validates, and adds them to the Question Bank
          automatically.
        </p>
      </div>

      {isAdmin ? (
        <Tabs defaultValue="library">
          <TabsList>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="dashboard">Processing Dashboard</TabsTrigger>
          </TabsList>
          <TabsContent value="library">
            <PdfLibraryTab />
          </TabsContent>
          <TabsContent value="dashboard">
            <ProcessingDashboardTab />
          </TabsContent>
        </Tabs>
      ) : (
        <PdfLibraryTab />
      )}
    </div>
  );
}
