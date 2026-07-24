import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, History, PenLine } from "lucide-react";
import type { BulkParsePreviewItem, QuestionAuthoringInput } from "@placeprep/shared";
import {
  useBulkImportQuestions,
  useBulkParseQuestions,
  useImportBatches,
  type BulkImportResponse,
} from "@/hooks/use-question-authoring";
import { QuestionAuthoringForm } from "@/components/questions/question-authoring-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/format";
import { ApiError } from "@/lib/api-client";

const STATUS_META: Record<
  BulkParsePreviewItem["status"],
  { icon: typeof CheckCircle2; label: string; variant: "correct" | "warning" | "incorrect" }
> = {
  parsed: { icon: CheckCircle2, label: "Parsed correctly", variant: "correct" },
  "warning-missing-answer": { icon: AlertTriangle, label: "Missing correct answer", variant: "warning" },
  "warning-missing-option": { icon: AlertTriangle, label: "Missing option", variant: "warning" },
  "warning-duplicate": { icon: AlertTriangle, label: "Duplicate detected", variant: "warning" },
  invalid: { icon: XCircle, label: "Invalid format", variant: "incorrect" },
};

export function AdminBulkImportPage() {
  const [rawText, setRawText] = useState("");
  const [label, setLabel] = useState("");
  const [items, setItems] = useState<BulkParsePreviewItem[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Record<number, QuestionAuthoringInput>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // Previously the only feedback after an import was an aggregate toast
  // ("Imported X of Y") -- when rows failed, there was no way to see WHY
  // without pulling server logs, since the API's per-row `results[].reason`
  // was fetched but simply discarded. `submitted` is a snapshot of what was
  // actually sent, kept alongside the response purely so a failed row can
  // still show its question text after `items`/`rawText` are cleared below.
  const [lastImport, setLastImport] = useState<{
    response: BulkImportResponse;
    submitted: QuestionAuthoringInput[];
  } | null>(null);

  const parse = useBulkParseQuestions();
  const bulkImport = useBulkImportQuestions();
  const { data: history } = useImportBatches();

  const editingItem = editingIndex !== null ? items[editingIndex] : null;

  function handleParse() {
    if (!rawText.trim()) {
      toast.error("Paste some questions first.");
      return;
    }
    parse.mutate(rawText, {
      onSuccess: (response) => {
        setItems(response.items);
        setExcluded(new Set(response.items.filter((i) => i.status === "invalid").map((i) => i.index)));
        setOverrides({});
        toast.success(`Detected ${response.totalDetected} question(s).`);
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't parse that text."),
    });
  }

  function toggleExcluded(index: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleImport() {
    const toImport = items
      .filter((i) => !excluded.has(i.index) && (overrides[i.index] || i.parsed))
      .map((i) => overrides[i.index] ?? i.parsed!);

    if (toImport.length === 0) {
      toast.error("Nothing to import -- every row is excluded or invalid.");
      return;
    }

    bulkImport.mutate(
      { items: toImport, label: label.trim() || null },
      {
        onSuccess: (result) => {
          setLastImport({ response: result, submitted: toImport });
          if (result.totalError > 0) {
            // Was previously a bare success toast even when every single
            // row failed (the 500-Internal-Server-Error/all-rows-failed
            // case) -- nothing distinguished "25 imported" from
            // "0 imported, 25 errored" except the wording of one line of
            // toast text, and the actual reason for each failure was
            // nowhere in the UI. The results card below now shows it.
            toast.warning(
              `Imported ${result.totalImported} of ${result.totalSubmitted} -- ${result.totalError} failed. See details below.`,
            );
          } else {
            toast.success(`Imported ${result.totalImported} of ${result.totalSubmitted} question(s).`);
          }
          setItems([]);
          setRawText("");
          setLabel("");
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Import failed."),
      },
    );
  }

  const includedCount = items.filter((i) => !excluded.has(i.index)).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Smart Bulk Question Parser</h1>
        <p className="text-sm text-muted-foreground">
          Paste dozens or hundreds of questions in the "Q1. / A. B. C. D. / Answer: / Solution:" format. No AI
          involved -- pure parsing, run through the same validation and duplicate detection as everything else in
          the bank.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paste questions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <textarea
            className="min-h-56 rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={"Q1. What is...\nA. ...\nB. ...\nAnswer: B\nSolution: ...\n\n---\n\nQ2. ..."}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleParse} disabled={parse.isPending}>
              {parse.isPending ? "Parsing..." : "Parse"}
            </Button>
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {items.length} detected -- {includedCount} selected for import
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Import</TableHead>
                  <TableHead className="w-44">Status</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const meta = STATUS_META[item.status];
                  const Icon = meta.icon;
                  const current = overrides[item.index] ?? item.parsed;
                  return (
                    <TableRow key={item.index} className={excluded.has(item.index) ? "opacity-50" : undefined}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={!excluded.has(item.index)}
                          disabled={!current}
                          onChange={() => toggleExcluded(item.index)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant} className="flex w-fit items-center gap-1">
                          <Icon className="size-3" /> {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="line-clamp-2 text-xs text-foreground">
                          {current?.text || item.rawBlock.slice(0, 120)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <ul className="list-disc pl-4 text-xs text-muted-foreground">
                          {item.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setEditingIndex(item.index)}>
                          <PenLine className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
              <input
                className="h-9 w-64 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Batch label (optional) -- e.g. GATE 2023 CS mock paper"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Button onClick={handleImport} disabled={bulkImport.isPending || includedCount === 0}>
                {bulkImport.isPending ? "Importing..." : `Import ${includedCount} question(s)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lastImport && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>
              Last import: {lastImport.response.totalImported} imported, {lastImport.response.totalDuplicate}{" "}
              duplicate, {lastImport.response.totalError} failed
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setLastImport(null)}>
              Dismiss
            </Button>
          </CardHeader>
          <CardContent>
            {lastImport.response.totalError === 0 && lastImport.response.totalDuplicate === 0 ? (
              <p className="text-sm text-muted-foreground">Every row imported cleanly.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Result</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lastImport.response.results
                    .filter((r) => !r.imported)
                    .map((r) => {
                      const isDuplicate = r.reason === "duplicate";
                      const submittedItem = lastImport.submitted[r.index];
                      return (
                        <TableRow key={r.index}>
                          <TableCell>
                            <Badge variant={isDuplicate ? "warning" : "incorrect"} className="flex w-fit items-center gap-1">
                              {isDuplicate ? <AlertTriangle className="size-3" /> : <XCircle className="size-3" />}
                              {isDuplicate ? "Duplicate" : "Failed"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-md">
                            <p className="line-clamp-2 text-xs text-foreground">
                              {submittedItem?.text ?? `Row ${r.index + 1}`}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.reason}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" /> Import history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <EmptyState icon={History} title="No imports yet" description="Past bulk import runs show up here with their stats." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>Duplicates</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.label || <span className="text-muted-foreground">Untitled batch</span>}</TableCell>
                    <TableCell>{b.totalDetected}</TableCell>
                    <TableCell>{b.totalImported}</TableCell>
                    <TableCell>{b.totalDuplicate}</TableCell>
                    <TableCell>{b.totalError}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(b.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editingIndex !== null} onOpenChange={(open) => !open && setEditingIndex(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit parsed question</DialogTitle>
          </DialogHeader>
          {editingItem && (editingItem.parsed || overrides[editingItem.index]) && (
            <QuestionAuthoringForm
              submitLabel="Save changes"
              initialValues={overrides[editingItem.index] ?? editingItem.parsed!}
              onSubmit={(input) => {
                setOverrides((prev) => ({ ...prev, [editingItem.index]: input }));
                setExcluded((prev) => {
                  const next = new Set(prev);
                  next.delete(editingItem.index);
                  return next;
                });
                setEditingIndex(null);
                toast.success("Row updated -- will be included on import.");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
