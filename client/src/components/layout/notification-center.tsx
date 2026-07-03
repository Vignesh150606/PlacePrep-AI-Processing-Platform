import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/hooks/use-notifications";

export function NotificationCenter() {
  const { data } = useNotifications();
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
        {notifications.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" className="border-none px-4 py-8" />
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!notification.isRead) markRead.mutate(notification.id);
                  if (notification.linkUrl) navigate({ to: notification.linkUrl });
                }}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 px-3 py-2.5 transition-colors hover:bg-surface",
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
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
