import { Activity, ClipboardCheck, Bookmark as BookmarkIcon, MessageSquare } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";

interface ActivityEntry {
  id: string;
  icon: typeof Activity;
  text: string;
  timestamp: string;
}

const activity: ActivityEntry[] = [
  {
    id: "a-1",
    icon: ClipboardCheck,
    text: "Scored 67% on \"Amazon SDE-1 — Mixed Practice\"",
    timestamp: "2026-06-29T08:03:15.000Z",
  },
  {
    id: "a-2",
    icon: BookmarkIcon,
    text: "Bookmarked a question on Java concurrency",
    timestamp: "2026-06-25T10:00:00.000Z",
  },
  {
    id: "a-3",
    icon: MessageSquare,
    text: "Replied to a thread in Community",
    timestamp: "2026-06-23T15:20:00.000Z",
  },
];

export function RecentActivityCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {activity.map((entry) => {
          const Icon = entry.icon;
          return (
            <div key={entry.id} className="flex items-start gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground">
                <Icon className="size-3.5" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-foreground">{entry.text}</p>
                <p className="text-xs text-muted-foreground">{formatRelativeTime(entry.timestamp)}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
