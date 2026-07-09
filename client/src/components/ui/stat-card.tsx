import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./card";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
  /**
   * FIX (consistency, UI audit): every other card on the Dashboard
   * (Recent PDFs, Upcoming Companies, Recent Activity) shows a Skeleton
   * while its query is loading. StatCard previously had no such prop, so
   * callers fell back to `data?.total ?? 0` — meaning stat tiles rendered
   * "0" for a beat before the real number arrived, which reads as broken
   * data rather than a loading state. Pass `isLoading` to show a skeleton
   * matching the rest of the page instead.
   */
  isLoading?: boolean;
}

export function StatCard({ label, value, icon: Icon, trend, className, isLoading }: StatCardProps) {
  const isPositive = trend ? trend.value >= 0 : null;

  if (isLoading) {
    return (
      <Card className={cn("p-5", className)}>
        <div className="flex items-start justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent-600/10 text-accent-600 dark:text-accent-400">
            <Icon className="size-4" />
          </div>
        </div>
        <Skeleton className="mt-3 h-8 w-16" />
      </Card>
    );
  }

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent-600/10 text-accent-600 dark:text-accent-400">
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {trend && (
        <p
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 text-xs font-medium",
            isPositive ? "text-correct-600 dark:text-correct-500" : "text-incorrect-600 dark:text-incorrect-500",
          )}
        >
          {isPositive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </Card>
  );
}
