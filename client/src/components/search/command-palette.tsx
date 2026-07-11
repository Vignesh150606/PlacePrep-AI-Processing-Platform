import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { BookOpenText, Building2, CornerDownLeft, FileText, Search } from "lucide-react";
import type { Company, PDFResource, Question } from "@placeprep/shared";
import { useQuestions } from "@/hooks/use-questions";
import { useCompanies } from "@/hooks/use-companies";
import { usePdfs } from "@/hooks/use-pdfs";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResultItem =
  | { kind: "question"; id: string; title: string; subtitle: string; data: Question }
  | { kind: "company"; id: string; title: string; subtitle: string; data: Company }
  | { kind: "pdf"; id: string; title: string; subtitle: string; data: PDFResource };

const MAX_PER_SECTION = 5;

const RESULT_ICON = {
  question: BookOpenText,
  company: Building2,
  pdf: FileText,
} as const;

/**
 * NEW (Sprint 1A): global search (⌘K / Ctrl+K), replacing the previously
 * decorative header search input. Searches whatever's already sitting in
 * React Query's cache (questions, companies, PDFs) — the same hooks the
 * Dashboard/Question Bank/Quiz pages already use — so opening this doesn't
 * trigger new fetches beyond React Query's normal staleness rules, and no
 * new backend endpoint is needed.
 *
 * Built on raw @radix-ui/react-dialog primitives rather than the shared
 * DialogContent (ui/dialog.tsx): DialogContent's base classes assume an
 * always-centered modal, which can't express "full-screen on mobile,
 * centered on desktop" without fighting Tailwind class-merge order across
 * breakpoints. This keeps the same visual language (overlay treatment,
 * surface/border/shadow at desktop size) while getting full control over
 * the responsive layout — and still gets Radix's modal contract (focus
 * trap, Escape-to-close, scroll lock, focus restored to the trigger) for
 * free, same as any other Radix Dialog in this app.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const { data: questionData } = useQuestions();
  const { data: companyData } = useCompanies();
  const { data: pdfData } = usePdfs();

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const sections = React.useMemo<{ label: string; items: ResultItem[] }[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const questionItems: ResultItem[] = (questionData?.items ?? [])
      .filter(
        (question) =>
          question.text.toLowerCase().includes(q) ||
          question.topic.toLowerCase().includes(q) ||
          question.subject.toLowerCase().includes(q),
      )
      .slice(0, MAX_PER_SECTION)
      .map((question) => ({
        kind: "question" as const,
        id: question.id,
        title: question.text,
        subtitle: [question.subject, question.topic].filter(Boolean).join(" · "),
        data: question,
      }));

    const companyItems: ResultItem[] = (companyData?.items ?? [])
      .filter(
        (company) =>
          company.name.toLowerCase().includes(q) || company.industry.toLowerCase().includes(q),
      )
      .slice(0, MAX_PER_SECTION)
      .map((company) => ({
        kind: "company" as const,
        id: company.id,
        title: company.name,
        subtitle: company.industry,
        data: company,
      }));

    const pdfItems: ResultItem[] = (pdfData?.items ?? [])
      .filter((pdf) => (pdf.title || pdf.fileName).toLowerCase().includes(q))
      .slice(0, MAX_PER_SECTION)
      .map((pdf) => ({
        kind: "pdf" as const,
        id: pdf.id,
        title: pdf.title || pdf.fileName,
        subtitle: pdf.processingStatus,
        data: pdf,
      }));

    return [
      { label: "Questions", items: questionItems },
      { label: "Companies", items: companyItems },
      { label: "PDFs", items: pdfItems },
    ].filter((section) => section.items.length > 0);
  }, [query, questionData, companyData, pdfData]);

  const flatResults = React.useMemo(() => sections.flatMap((section) => section.items), [sections]);

  const go = React.useCallback(
    (item: ResultItem) => {
      onOpenChange(false);
      // Companies have a real detail route; questions and PDFs don't have
      // per-item deep links yet (Question Bank / PDF Library search state
      // is local component state, not URL-driven) — landing on the list
      // page is the honest scope for this sprint without touching those
      // pages' internals, which aren't in this sprint's file list.
      if (item.kind === "company") {
        navigate({ to: "/companies/$slug", params: { slug: item.data.slug } });
      } else if (item.kind === "pdf") {
        navigate({ to: "/pdfs" });
      } else {
        navigate({ to: "/questions" });
      }
    },
    [navigate, onOpenChange],
  );

  function handleInputKeyDown(event: React.KeyboardEvent) {
    if (flatResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flatResults.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatResults[activeIndex];
      if (item) go(item);
    }
  }

  React.useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    container.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-surface-raised",
            "lg:inset-auto lg:left-1/2 lg:top-24 lg:h-auto lg:max-h-[70vh] lg:w-full lg:max-w-[560px]",
            "lg:-translate-x-1/2 lg:rounded-xl lg:border lg:border-border lg:shadow-xl",
            "data-[state=open]:animate-scale-in",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Search PlacePrep</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search questions, companies, and PDFs already loaded in this session.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Search questions, companies, PDFs..."
              aria-label="Search"
              role="combobox"
              aria-expanded={flatResults.length > 0}
              aria-controls="command-palette-results"
              aria-activedescendant={flatResults[activeIndex] ? `cmdk-item-${activeIndex}` : undefined}
              className="h-9 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-[11px] text-muted-foreground sm:block">
              Esc
            </kbd>
          </div>

          <div
            id="command-palette-results"
            ref={listRef}
            role="listbox"
            aria-label="Search results"
            className="flex-1 overflow-y-auto p-2"
          >
            {query.trim() === "" ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                Start typing to search the question bank, companies, and PDFs.
              </p>
            ) : flatResults.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                No matches for &ldquo;{query}&rdquo;.
              </p>
            ) : (
              sections.map((section) => (
                <div key={section.label} className="mb-2">
                  <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {section.label}
                  </p>
                  {section.items.map((item) => {
                    const index = flatResults.findIndex((r) => r.kind === item.kind && r.id === item.id);
                    const Icon = RESULT_ICON[item.kind];
                    const isActive = index === activeIndex;
                    return (
                      <button
                        key={`${item.kind}-${item.id}`}
                        id={`cmdk-item-${index}`}
                        data-index={index}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => go(item)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                          isActive ? "bg-accent-600/10 text-foreground" : "text-foreground hover:bg-surface",
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{item.title}</span>
                          {item.subtitle && (
                            <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                          )}
                        </span>
                        {isActive && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
