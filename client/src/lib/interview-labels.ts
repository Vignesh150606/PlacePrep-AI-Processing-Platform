import type { InterviewRoundType } from "@placeprep/shared";

/** Shared between interview-experiences-page.tsx and company-detail-page.tsx
 * so both use the exact same labels/colors rather than redefining them --
 * kept in a plain lib file (not exported from a page component) so it
 * doesn't trip the react-refresh "only export components" lint rule. */
export const ROUND_TYPE_LABELS: Record<InterviewRoundType, string> = {
  "online-assessment": "Online Assessment",
  technical: "Technical",
  hr: "HR",
  managerial: "Managerial",
  "group-discussion": "Group Discussion",
};

export const OUTCOME_VARIANT: Record<string, "correct" | "incorrect" | "warning" | "neutral"> = {
  selected: "correct",
  rejected: "incorrect",
  "in-progress": "warning",
  withdrawn: "neutral",
};
