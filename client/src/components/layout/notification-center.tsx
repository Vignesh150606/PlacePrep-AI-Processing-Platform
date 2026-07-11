import { Bell, Loader2 } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/hooks/use-notifications";

export function NotificationCenter() {
  // FIX: previously this destructured only `data`, so on first render (before
  // the query resolves) `notifications` was `[]` and the dropdown briefly
  // flashed "No notifications" before the real list arrived. Checking
  // `isLoading` first shows a proper loading state instead of a false empty
  // state.
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const notifications = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications, ${unreadCount} unread`} className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-2 rounded-full bg-incorrect-500" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <DropdownMenuLabel className="p-0 text-sm font-semibold text-foreground">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="text-xs font-medium text-accent-600 hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading notifications…
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" className="border-none px-4 py-8" />
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {notifications.map((notification) => {
              function activate() {
                if (!notification.isRead) markRead.mutate(notification.id);
                if (notification.linkUrl) navigate({ to: notification.linkUrl });
              }
              return (
                <li
                  key={notification.id}
                  role="button"
                  tabIndex={0}
                  onClick={activate}
                  // FIX (Sprint 1A): this was role="button" tabIndex={0} with
                  // no onKeyDown, so Enter/Space did nothing for keyboard
                  // users. Now maps both to the same action as onClick.
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      activate();
                    }
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 px-3 py-2.5 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    !notification.isRead && "bg-accent-600/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{notification.title}</p>
                    {!notification.isRead && <span className="size-1.5 shrink-0 rounded-full bg-accent-600" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{notification.message}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <DropdownMenuSeparator className="my-0" />
        {/* NEW (Sprint 1A): footer link into the new standalone Notifications page. */}
        <DropdownMenuItem asChild className="justify-center text-xs font-medium text-accent-600">
          <Link to="/notifications">View all</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
