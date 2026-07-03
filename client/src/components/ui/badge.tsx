import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-surface text-muted-foreground border border-border-subtle",
        accent: "bg-accent-50 text-accent-700 dark:bg-accent-600/15 dark:text-accent-400",
        correct: "bg-correct-500/10 text-correct-600 dark:text-correct-500",
        incorrect: "bg-incorrect-500/10 text-incorrect-600 dark:text-incorrect-500",
        warning: "bg-warning-500/10 text-warning-500",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const DIFFICULTY_VARIANT = {
  easy: "correct",
  medium: "warning",
  hard: "incorrect",
} as const;

export function DifficultyBadge({ difficulty }: { difficulty: "easy" | "medium" | "hard" }) {
  return (
    <Badge variant={DIFFICULTY_VARIANT[difficulty]} className="capitalize">
      {difficulty}
    </Badge>
  );
}
