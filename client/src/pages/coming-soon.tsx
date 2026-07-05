import { Construction } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface ComingSoonPageProps {
  title: string;
}

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
