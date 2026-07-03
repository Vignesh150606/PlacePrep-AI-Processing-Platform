import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface ComingSoonPageProps {
  title: string;
}

/**
 * Placeholder for nav destinations outside Sprint 1A scope (Dashboard,
 * Question Bank, Quiz, Company Details). Keeps every sidebar link
 * functional — no broken routes — without faking finished pages for
 * features that haven't been designed yet.
 */
export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <EmptyState
        icon={Construction}
        title="Coming in a future sprint"
        description="This section hasn't been built yet. It's on the roadmap."
      />
    </div>
  );
}
