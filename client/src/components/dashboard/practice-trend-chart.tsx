import { LineChart } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * FIX: this used to render a hand-typed array of "questions attempted per
 * day" that was pure fiction — nothing tracks that yet. Rather than keep a
 * chart that always shows the same fake week, this is an honest placeholder
 * until Quiz Attempts (Sprint 5) actually produce per-day data to chart.
 */
export function PracticeTrendChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice activity</CardTitle>
        <CardDescription>Questions attempted over time</CardDescription>
      </CardHeader>
      <CardContent className="flex h-56 items-center">
        <EmptyState
          icon={LineChart}
          title="Not tracked yet"
          description="Quiz attempt history isn't wired up yet — this chart fills in once the Quiz Engine ships."
          className="w-full border-none py-0"
        />
      </CardContent>
    </Card>
  );
}
