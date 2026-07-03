import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ label, value, icon: Icon, trend, className }: StatCardProps) {
  const isPositive = trend ? trend.value >= 0 : null;

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
