import * as React from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExplanationSectionProps {
  correctExplanation?: string | null;
  solutionSteps?: string | null;
  /** Starts expanded -- used where a spoiler isn't a concern (an admin
   * reviewing content, or a bulk-import edit dialog), as opposed to a
   * student seeing a question mid-quiz. */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * One canonical "why is this the answer" block, reused everywhere a
 * question is displayed -- Question Bank, Bookmarks, Wrong Answer
 * Notebook, Company pages (all via `QuestionCard`), Quiz Review, Admin
 * Preview -- instead of each surface rolling its own.
 *
 * That mattered here specifically: most of those surfaces were rendering
 * nothing at all, and the one that did (`quiz-result.tsx`) checked only
 * `correctExplanation`, silently showing nothing for a question whose
 * content came in via `solutionSteps` instead. Those are two
 * intentionally distinct fields (see `shared/src/types/question.ts`) --
 * "why this option is correct" vs. a fuller worked solution -- but the
 * Smart Bulk Parser's paste format has only ONE combined
 * "Explanation:"/"Solution:" field, which maps to `solutionSteps` (see
 * `services/question_authoring.py`). A bulk-imported question has never
 * had anything in `correctExplanation`, so any surface that only checked
 * that field showed nothing for it -- not a bug in storage, a gap in
 * display.
 *
 * Renders nothing if both fields are empty, so callers can drop this in
 * unconditionally without an extra guard at every call site.
 */
export function ExplanationSection({
  correctExplanation,
  solutionSteps,
  defaultOpen = false,
  className,
}: ExplanationSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const hasExplanation = Boolean(correctExplanation?.trim());
  const hasSolution = Boolean(solutionSteps?.trim());
  if (!hasExplanation && !hasSolution) return null;

  const label = hasExplanation && hasSolution ? "explanation & solution" : hasSolution ? "solution" : "explanation";

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border-subtle", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-accent-700 hover:bg-surface dark:text-accent-400"
      >
        <span className="flex items-center gap-1.5">
          <Lightbulb className="size-3.5" />
          {open ? "Hide" : "View"} {label}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border-subtle bg-surface/50 px-3 py-2.5 text-sm text-foreground">
          {hasExplanation && (
            <div>
              {hasSolution && (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Explanation
                </p>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{correctExplanation}</p>
            </div>
          )}
          {hasSolution && (
            <div>
              {hasExplanation && (
                <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Full solution
                </p>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{solutionSteps}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
