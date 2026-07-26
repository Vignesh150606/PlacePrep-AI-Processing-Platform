import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDailyChallenge, useDailyChallengeStreak } from "@/hooks/use-daily-challenge";

/**
 * Phase 18. `GET /daily-challenge/today` and `/streak` have been real,
 * working endpoints since Phase 6 (weak-topic-weighted selection, real
 * streak tracking) with zero frontend consumption -- flagged as an open
 * gap in `FUNCTIONAL_RECOMMENDATIONS.md`. This card is that frontend, and
 * the Dashboard's primary "Recommended Action" alongside Continue Practice.
 */
export function DailyChallengeCard() {
  const { data: challenge, isLoading } = useDailyChallenge();
  const { data: streak } = useDailyChallengeStreak();

  if (isLoading) {
    return <Skeleton className="h-full min-h-40 w-full rounded-xl" />;
  }

  const completedToday = challenge?.completed ?? false;

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-warning-500/10 via-transparent to-transparent" />
      <CardContent className="relative flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Daily Challenge</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-warning-500/15 text-warning-500">
            <Flame className="size-4" />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {completedToday ? "Today's challenge complete" : `${challenge?.questionIds.length ?? 5} questions today`}
          </p>
          <p className="text-sm text-muted-foreground">
            {streak && streak.currentStreak > 0
              ? `${streak.currentStreak} day streak${completedToday ? " — nice work" : ", keep it going"}`
              : challenge && challenge.weakTopicQuestionCount > 0
                ? `${challenge.weakTopicQuestionCount} from your weaker topics`
                : "A quick daily mix from the question bank"}
          </p>
        </div>
        <Button asChild size="sm" variant={completedToday ? "secondary" : "primary"} className="w-fit">
          <Link to="/quiz" search={{ mode: "daily-challenge" }}>
            {completedToday ? (
              <>
                <CheckCircle2 className="size-3.5" />
                Practice again
              </>
            ) : (
              <>
                Start challenge
                <ArrowRight className="size-3.5" />
              </>
            )}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
