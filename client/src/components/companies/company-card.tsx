import { Link } from "@tanstack/react-router";
import { Building2, ArrowRight } from "lucide-react";
import type { Company } from "@placeprep/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TIER_LABEL: Record<Company["tier"], string> = {
  dream: "Dream",
  "super-dream": "Super Dream",
  core: "Core",
  "mass-recruiter": "Mass Recruiter",
};

const TIER_VARIANT: Record<Company["tier"], "accent" | "warning" | "neutral"> = {
  dream: "accent",
  "super-dream": "accent",
  core: "warning",
  "mass-recruiter": "neutral",
};

export function CompanyCard({ company }: { company: Company }) {
  return (
    <Link to="/companies/$slug" params={{ slug: company.slug }}>
      <Card className="group flex h-full flex-col gap-3 p-5 transition-colors hover:border-accent-600/40">
        <div className="flex items-start justify-between">
          <div className="flex size-10 items-center justify-center rounded-lg bg-surface text-muted-foreground">
            <Building2 className="size-5" />
          </div>
          <Badge variant={TIER_VARIANT[company.tier]}>{TIER_LABEL[company.tier]}</Badge>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{company.name}</p>
          <p className="text-xs text-muted-foreground">{company.industry}</p>
        </div>
        <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{company.description}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{company.questionCount} questions</span>
          <span className={cn("flex items-center gap-1 font-medium text-accent-600 dark:text-accent-400 opacity-0 transition-opacity group-hover:opacity-100")}>
            View
            <ArrowRight className="size-3" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
