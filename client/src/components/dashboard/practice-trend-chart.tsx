import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

const data = [
  { day: "Mon", questions: 12 },
  { day: "Tue", questions: 18 },
  { day: "Wed", questions: 9 },
  { day: "Thu", questions: 24 },
  { day: "Fri", questions: 16 },
  { day: "Sat", questions: 31 },
  { day: "Sun", questions: 22 },
];

export function PracticeTrendChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice activity</CardTitle>
        <CardDescription>Questions attempted over the last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="h-56 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="practiceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))" }}
              contentStyle={{
                background: "hsl(var(--surface-raised))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Area
              type="monotone"
              dataKey="questions"
              stroke="var(--color-accent-500)"
              strokeWidth={2}
              fill="url(#practiceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
