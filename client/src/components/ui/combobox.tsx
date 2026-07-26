import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Plus, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase 18 -- Company Admin Management, Part 4 (Company Input UX).
 *
 * A generic, accessible combobox: type to filter, arrow keys to navigate,
 * Enter to select, Escape to close. Built on `@radix-ui/react-popover`
 * (new dependency this pass -- every other interactive primitive in
 * `components/ui/` is already Radix-based, so this keeps that convention
 * rather than hand-rolling positioning/focus/outside-click logic that
 * Radix already solves correctly).
 *
 * Deliberately generic (not company-specific) -- `components/companies/
 * company-combobox.tsx` is the thin, domain-specific wrapper that supplies
 * `options`/`onCreateOption` from `useCompanies()`. Kept separate so this
 * file has no dependency on `@placeprep/shared`'s `Company` type and could
 * genuinely be reused for any other "pick one from a searchable list, or
 * tell me it's not there" field in the app.
 */
export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown in the empty list when nothing matches and `onCreateOption`
   * isn't provided (or the caller doesn't want a create affordance shown
   * for this user -- e.g. a non-admin). */
  emptyMessage?: string;
  /** When provided, a matched-nothing state renders a "+ Create <query>"
   * row instead of (or in addition to, if `alwaysShowCreate`) the empty
   * message. The caller owns what "create" actually does (e.g. open a
   * dialog) -- this component only renders the affordance and reports the
   * raw typed text. */
  onCreateOption?: (query: string) => void;
  createLabel?: (query: string) => string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** Simple, dependency-free fuzzy-ish filter: a query matches an option if
 * every character of the query appears in order somewhere in the label
 * (a lightweight subsequence match -- catches "mic" -> "Microsoft" and
 * "ama" -> "Amazon" the same as a substring match would, but also handles
 * a skipped letter or two without needing a real fuzzy-search dependency
 * for a list that's realistically a few hundred companies at most).
 * Results are ranked: exact-prefix match first, then substring match,
 * then subsequence-only match, alphabetical within each tier. */
function filterAndRankOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const q = normalize(query);
  if (!q) return options;

  function subsequenceMatch(label: string): boolean {
    let i = 0;
    for (const char of label) {
      if (char === q[i]) i += 1;
      if (i === q.length) return true;
    }
    return i === q.length;
  }

  const scored = options
    .map((option) => {
      const label = normalize(option.label);
      let tier: number | null = null;
      if (label.startsWith(q)) tier = 0;
      else if (label.includes(q)) tier = 1;
      else if (subsequenceMatch(label)) tier = 2;
      return tier === null ? null : { option, tier };
    })
    .filter((entry): entry is { option: ComboboxOption; tier: number } => entry !== null);

  scored.sort((a, b) => a.tier - b.tier || a.option.label.localeCompare(b.option.label));
  return scored.map((entry) => entry.option);
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Search...",
  emptyMessage = "No matches found.",
  onCreateOption,
  createLabel = (query) => `Create "${query}"`,
  disabled,
  id,
  className,
  ...ariaProps
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((option) => option.value === value) ?? null;

  const filtered = React.useMemo(() => filterAndRankOptions(options, query), [options, query]);
  const showCreateRow = !!onCreateOption && query.trim().length > 0;
  const totalRows = filtered.length + (showCreateRow ? 1 : 0);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  React.useEffect(() => {
    if (open) {
      // Start from the current selection's label so backspacing narrows
      // from what's already picked, rather than an empty box that looks
      // like nothing is selected.
      setQuery(selectedOption?.label ?? "");
      window.requestAnimationFrame(() => inputRef.current?.select());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function selectOption(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (totalRows > 0) setActiveIndex((i) => (i + 1) % totalRows);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (totalRows > 0) setActiveIndex((i) => (i - 1 + totalRows) % totalRows);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex < filtered.length) {
        const option = filtered[activeIndex];
        if (option) selectOption(option);
      } else if (showCreateRow) {
        onCreateOption?.(query.trim());
        setOpen(false);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <div className={cn("relative", className)}>
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={id ? `${id}-listbox` : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && totalRows > 0 ? `${id ?? "combobox"}-option-${activeIndex}` : undefined}
            aria-label={ariaProps["aria-label"]}
            disabled={disabled}
            value={open ? query : selectedOption?.label ?? ""}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!open) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "h-9 w-full rounded-lg border border-border bg-surface-raised px-3 pr-8 text-sm text-foreground",
              "placeholder:text-muted-foreground transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
          <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            "z-50 max-h-72 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg",
            "data-[state=open]:animate-fade-in",
          )}
        >
          <div id={id ? `${id}-listbox` : undefined} ref={listRef} role="listbox" aria-label={ariaProps["aria-label"]}>
            {filtered.length === 0 && !showCreateRow && (
              <p className="flex items-center gap-2 px-3 py-6 text-center text-sm text-muted-foreground">
                <SearchX className="size-4 shrink-0" />
                {emptyMessage}
              </p>
            )}
            {filtered.map((option, index) => {
              const isActive = index === activeIndex;
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  id={`${id ?? "combobox"}-option-${index}`}
                  data-index={index}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    isActive ? "bg-accent-600/10 text-foreground" : "text-foreground hover:bg-surface",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{option.label}</span>
                    {option.sublabel && (
                      <span className="truncate text-xs text-muted-foreground">{option.sublabel}</span>
                    )}
                  </span>
                  {isSelected && <Check className="size-4 shrink-0 text-accent-600" />}
                </button>
              );
            })}
            {showCreateRow && (
              <button
                type="button"
                role="option"
                aria-selected={activeIndex === filtered.length}
                data-index={filtered.length}
                onMouseEnter={() => setActiveIndex(filtered.length)}
                onClick={() => {
                  onCreateOption?.(query.trim());
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                  activeIndex === filtered.length
                    ? "bg-accent-600/10 text-accent-700 dark:text-accent-400"
                    : "text-accent-600 hover:bg-surface dark:text-accent-400",
                )}
              >
                <Plus className="size-4 shrink-0" />
                {createLabel(query.trim())}
              </button>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
