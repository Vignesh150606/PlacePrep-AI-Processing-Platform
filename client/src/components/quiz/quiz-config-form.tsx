import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanies } from "@/hooks/use-companies";
import { useQuestions } from "@/hooks/use-questions";
import { useWrongAnswers } from "@/hooks/use-wrong-answers";
import { useBookmarksList } from "@/hooks/use-bookmarks";

const quizConfigSchema = z.object({
  mode: z.enum(["topic", "company", "mixed", "random", "wrong-answers", "bookmarks"]),
  topic: z.string().optional(),
  companyId: z.string().optional(),
  questionCount: z.number().min(3).max(20),
  timeLimitMinutes: z.number().nullable(),
});

export type QuizConfig = z.infer<typeof quizConfigSchema>;

interface QuizConfigFormProps {
  onStart: (config: QuizConfig) => void;
  /**
   * NEW (Sprint 1A): pre-selects a mode when arriving from a specific CTA
   * (Bookmarks' "Practice bookmarks", Wrong Answers' "Retry all") instead of
   * always defaulting to "mixed". Falls back to "mixed" when omitted, same
   * as before.
   */
  defaultMode?: QuizConfig["mode"];
}

// The question-count picker offers up to 20 to match the schema's own max —
// previously it only went up to 10, so nobody could actually reach 20.
const QUESTION_COUNT_OPTIONS = [3, 5, 10, 20] as const;
const TIME_LIMIT_OPTIONS: { label: string; value: number | null }[] = [
  { label: "No limit", value: null },
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "20 min", value: 20 },
];

export function QuizConfigForm({ onStart, defaultMode }: QuizConfigFormProps) {
  const { data: companyData } = useCompanies();
  const { data: questionData } = useQuestions();
  const { data: wrongAnswerData } = useWrongAnswers();
  const { data: bookmarkData } = useBookmarksList();

  const companies = companyData?.items ?? [];
  const topics = Array.from(
    new Set((questionData?.items ?? []).map((q) => q.topic).filter((t) => t.length > 0)),
  ).sort();

  const wrongAnswerCount = (wrongAnswerData?.items ?? []).filter((w) => !w.resolved).length;
  const bookmarkedQuestionCount = (bookmarkData?.items ?? []).filter((b) => b.targetType === "question").length;

  const { control, handleSubmit, watch } = useForm<QuizConfig>({
    resolver: zodResolver(quizConfigSchema),
    defaultValues: { mode: defaultMode ?? "mixed", questionCount: 5, timeLimitMinutes: null },
  });

  const mode = watch("mode");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate a quiz</CardTitle>
        <CardDescription>Pick a mode and we'll pull matching questions from the bank.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onStart)} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>Mode</Label>
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <Tabs value={field.value} onValueChange={field.onChange}>
                  <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="topic">Topic-wise</TabsTrigger>
                    <TabsTrigger value="company">Company-wise</TabsTrigger>
                    <TabsTrigger value="mixed">Mixed</TabsTrigger>
                    <TabsTrigger value="random">Random</TabsTrigger>
                    <TabsTrigger value="wrong-answers" disabled={wrongAnswerCount === 0}>
                      Wrong Answers {wrongAnswerCount > 0 ? `(${wrongAnswerCount})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="bookmarks" disabled={bookmarkedQuestionCount === 0}>
                      Bookmarks {bookmarkedQuestionCount > 0 ? `(${bookmarkedQuestionCount})` : ""}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />
            {mode === "wrong-answers" && wrongAnswerCount === 0 && (
              <p className="text-xs text-muted-foreground">
                No unresolved wrong answers yet — they'll show up here after you get a question wrong.
              </p>
            )}
            {mode === "bookmarks" && bookmarkedQuestionCount === 0 && (
              <p className="text-xs text-muted-foreground">
                No bookmarked questions yet — bookmark some from the Question Bank first.
              </p>
            )}
          </div>

          {mode === "topic" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="topic">Topic</Label>
              <Controller
                control={control}
                name="topic"
                render={({ field }) => (
                  <select
                    {...field}
                    id="topic"
                    className="h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select a topic</option>
                    {topics.map((topic) => (
                      <option key={topic} value={topic}>
                        {topic}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
          )}

          {mode === "company" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="company">Company</Label>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => (
                  <select
                    {...field}
                    id="company"
                    className="h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select a company</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>Number of questions</Label>
            <Controller
              control={control}
              name="questionCount"
              render={({ field }) => (
                <div className="flex gap-2">
                  {QUESTION_COUNT_OPTIONS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => field.onChange(count)}
                      className={`h-9 flex-1 rounded-lg border text-sm font-medium transition-colors ${
                        field.value === count
                          ? "border-accent-600 bg-accent-600/10 text-accent-700 dark:text-accent-400"
                          : "border-border text-muted-foreground hover:bg-surface"
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Time limit</Label>
            <Controller
              control={control}
              name="timeLimitMinutes"
              render={({ field }) => (
                <div className="flex gap-2">
                  {TIME_LIMIT_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => field.onChange(opt.value)}
                      className={`h-9 flex-1 rounded-lg border text-sm font-medium transition-colors ${
                        field.value === opt.value
                          ? "border-accent-600 bg-accent-600/10 text-accent-700 dark:text-accent-400"
                          : "border-border text-muted-foreground hover:bg-surface"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          <Button type="submit" className="w-fit">
            <Sparkles className="size-4" />
            Generate quiz
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
