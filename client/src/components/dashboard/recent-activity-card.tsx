import { Bell, ClipboardCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/hooks/use-notifications";
import { formatRelativeTime } from "@/lib/format";

/**
 * FIX: this card used to render a hardcoded fake activity feed (a scored
 * quiz, a bookmark, a community reply — none of which had happened). There's
 * no activity-log backend surface yet, but there IS a real notifications
 * feed already wired up (see hooks/use-notifications.ts) — reusing it here
 * gives an honest "recent activity" view instead of fabricated events.
 */
export function RecentActivityCard() {
  const { data, isLoading } = useNotifications();
  const recent = (data?.items ?? []).slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState icon={Bell} title="No activity yet" className="border-none py-6" />
        ) : (
          recent.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground">
                <ClipboardCheck className="size-3.5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-foreground">{entry.title}</p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(entry.createdAt)}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
