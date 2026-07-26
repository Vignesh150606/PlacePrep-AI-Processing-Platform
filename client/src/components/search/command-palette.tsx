import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { BookOpenText, Building2, CornerDownLeft, FileText, Loader2, Search } from "lucide-react";
import type { SearchCompanyResult, SearchPdfResult, SearchQuestionResult } from "@placeprep/shared";
import { useSearch } from "@/hooks/use-search";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResultItem =
  | { kind: "question"; id: string; title: string; subtitle: string; data: SearchQuestionResult }
  | { kind: "company"; id: string; title: string; subtitle: string; data: SearchCompanyResult }
  | { kind: "pdf"; id: string; title: string; subtitle: string; data: SearchPdfResult };

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

const RESULT_ICON = {
  question: BookOpenText,
  company: Building2,
  pdf: FileText,
} as const;

/**
 * Phase 18 -- Part 5 (Global Search) of this pass's UX brief. Previously
 * (Sprint 1A) this searched whatever happened to already be sitting in
 * `useQuestions()`/`useCompanies()`/`usePdfs()`'s own React Query cache --
 * incomplete for anyone who hadn't already loaded the full question bank
 * into that cache that session, and blind to anything `GET /search`
 * itself covers that those three list hooks don't. `GET /search` (Phase 6)
 * has been sitting unused the whole time -- `FUNCTIONAL_RECOMMENDATIONS.md`
 * flagged this exact gap. This is the real wiring, debounced client-side
 * (the backend has no debounce of its own -- a keystroke-per-request
 * palette would otherwise fire a network request on every character).
 *
 * Still built on raw @radix-ui/react-dialog primitives rather than the
 * shared DialogContent -- see the original Sprint 1A note this replaces:
 * DialogContent's base classes assume an always-centered modal, which
 * can't express "full-screen on mobile, centered on desktop" without
 * fighting Tailwind class-merge order across breakpoints.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const { data, isLoading, isFetching } = useSearch(debouncedQuery);
  // `isLoading` alone would flash a stale "no results yet" state between
  // debounce ticks; `isFetching` covers "results exist but a newer query
  // is in flight" too.
  const searchPending = debouncedQuery.trim().length >= MIN_QUERY_LENGTH && (isLoading || isFetching);

  const sections = React.useMemo<{ label: string; items: ResultItem[] }[]>(() => {
    if (!data) return [];
    const questionItems: ResultItem[] = data.questions.map((q) => ({
      kind: "question" as const,
      id: q.id,
      title: q.text,
      subtitle: q.difficulty,
      data: q,
    }));
    const companyItems: ResultItem[] = data.companies.map((c) => ({
      kind: "company" as const,
      id: c.id,
      title: c.name,
      subtitle: c.tier.replace("-", " "),
      data: c,
    }));
    const pdfItems: ResultItem[] = data.pdfs.map((p) => ({
      kind: "pdf" as const,
      id: p.id,
      title: p.title || p.fileName,
      subtitle: p.processingStatus,
      data: p,
    }));
    return [
      { label: "Questions", items: questionItems },
      { label: "Companies", items: companyItems },
      { label: "PDFs", items: pdfItems },
    ].filter((section) => section.items.length > 0);
  }, [data]);

  const flatResults = React.useMemo(() => sections.flatMap((section) => section.items), [sections]);

  const go = React.useCallback(
    (item: ResultItem) => {
      onOpenChange(false);
      // Companies have a real detail route; questions and PDFs don't have
      // per-item deep links yet (Question Bank / PDF Library filter state
      // is local component state, not URL-driven) -- landing on the list
      // page is the honest scope here, unchanged from Sprint 1A.
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

  React.useEffect(() => {
    setActiveIndex(0);
  }, [data]);

  const trimmedQuery = query.trim();
  const belowMinLength = trimmedQuery.length > 0 && trimmedQuery.length < MIN_QUERY_LENGTH;

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
            Search questions, companies, and PDFs.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {searchPending ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
            {trimmedQuery === "" ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                Start typing to search questions, companies, and PDFs.
              </p>
            ) : belowMinLength ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">Keep typing...</p>
            ) : searchPending && flatResults.length === 0 ? (
              <div className="flex flex-col gap-1 p-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-surface" />
                ))}
              </div>
            ) : flatResults.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                No matches for &ldquo;{trimmedQuery}&rdquo;.
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
                            <span className="truncate text-xs capitalize text-muted-foreground">{item.subtitle}</span>
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
