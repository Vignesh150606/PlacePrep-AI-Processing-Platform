import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/use-notifications";

/**
 * NEW (Sprint 1A): the standalone Notifications page. hooks/use-notifications.ts
 * (list, mark-read, mark-all-read) was already fully real before this sprint
 * — only this page and the "View all" link into it were missing.
 */
export function NotificationsPage() {
  const { data, isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const notifications = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  function activate(notification: (typeof notifications)[number]) {
    if (!notification.isRead) markRead.mutate(notification.id);
    if (notification.linkUrl) navigate({ to: notification.linkUrl });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`
                : "You're all caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load your notifications." onRetry={() => refetch()} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You'll see updates about new companies, resources, and community activity here."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul>
            {notifications.map((notification, index) => (
              <li
                key={notification.id}
                role="button"
                tabIndex={0}
                onClick={() => activate(notification)}
                // FIX (Sprint 1A): keyboard users previously had no way to
                // activate a role="button" list item — Enter/Space now
                // trigger the same action as a click.
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activate(notification);
                  }
                }}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 px-4 py-3.5 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  index > 0 && "border-t border-border-subtle",
                  !notification.isRead && "bg-accent-600/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{notification.title}</p>
                  {!notification.isRead && <span className="size-1.5 shrink-0 rounded-full bg-accent-600" />}
                </div>
                <p className="text-sm text-muted-foreground">{notification.message}</p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(notification.createdAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
