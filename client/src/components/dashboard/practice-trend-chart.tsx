import { LineChart as LineChartIcon } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuizAttempts } from "@/hooks/use-quiz-attempts";
import { formatDate } from "@/lib/format";

export function PracticeTrendChart() {
  const { data, isLoading } = useQuizAttempts();
  const completed = (data?.items ?? [])
    .filter((a) => a.status === "completed" && a.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? -1 : 1))
    .slice(-20)
    .map((a) => ({
      date: formatDate(a.completedAt!),
      score: Math.round(a.score),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice activity</CardTitle>
        <CardDescription>Score over your last {completed.length || 0} quiz attempts</CardDescription>
      </CardHeader>
      <CardContent className="h-56">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : completed.length === 0 ? (
          <EmptyState
            icon={LineChartIcon}
            title="No quiz attempts yet"
            description="Complete a quiz and your score trend will show up here."
            className="h-full w-full border-none py-0"
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={completed} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--surface-raised))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="score" stroke="#6e56cf" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
