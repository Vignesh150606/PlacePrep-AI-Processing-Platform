import { useState } from "react";
import { Bookmark, Download, ExternalLink, FileText, User } from "lucide-react";
import type { Resource } from "@placeprep/shared";
import { RESOURCE_CATEGORIES } from "@placeprep/shared";
import { Card } from "@/components/ui/card";
import { Badge, DifficultyBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import { useDownloadResource } from "@/hooks/use-resources";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL = new Map(RESOURCE_CATEGORIES.map((c) => [c.value, c.label]));

interface ResourceCardProps {
  resource: Resource;
  isBookmarked?: boolean;
  onToggleBookmark?: (resourceId: string) => void;
  /** Hide the company badge when the card already lives inside that
   * company's own page (Company Hub's Resources tab) -- redundant there. */
  hideCompanyBadge?: boolean;
}

export function ResourceCard({ resource, isBookmarked, onToggleBookmark, hideCompanyBadge }: ResourceCardProps) {
  const downloadMutation = useDownloadResource();
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setError(null);
    try {
      const result = await downloadMutation.mutateAsync(resource.id);
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Couldn't open this resource. Please try again.");
    }
  }

  const isExternal = !!resource.externalUrl;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="accent">{CATEGORY_LABEL.get(resource.category) ?? resource.category}</Badge>
          {resource.difficulty && <DifficultyBadge difficulty={resource.difficulty} />}
          {resource.subjectName && <Badge variant="neutral">{resource.subjectName}</Badge>}
          {resource.topicName && <Badge variant="neutral">{resource.topicName}</Badge>}
          {!hideCompanyBadge && resource.companyName && <Badge variant="neutral">{resource.companyName}</Badge>}
          {resource.status === "pending-review" && <Badge variant="warning">Pending review</Badge>}
          {resource.status === "rejected" && <Badge variant="incorrect">Rejected</Badge>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isBookmarked ? "Remove bookmark" : "Bookmark resource"}
          aria-pressed={isBookmarked}
          onClick={() => onToggleBookmark?.(resource.id)}
        >
          <Bookmark className={cn("size-4", isBookmarked && "fill-accent-600 text-accent-600")} />
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-semibold leading-snug text-foreground">{resource.title}</h3>
        {resource.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{resource.description}</p>
        )}
      </div>

      {resource.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {resource.tags.map((tag) => (
            <Badge key={tag} variant="neutral" className="text-[11px]">
              #{tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <User className="size-3.5" />
            {resource.author || resource.uploaderName || "Unknown"}
          </span>
          <span>{formatRelativeTime(resource.uploadedAt)}</span>
        </span>
        <span className="flex items-center gap-3">
          <span>{resource.downloadCount} downloads</span>
          <span className="flex items-center gap-1">
            <Bookmark className="size-3.5" /> {resource.bookmarkCount}
          </span>
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isExternal ? (
            <>
              <ExternalLink className="size-3.5" /> External link
            </>
          ) : (
            <>
              <FileText className="size-3.5" />
              {resource.fileName}
              {resource.fileSizeBytes != null && <> · {formatBytes(resource.fileSizeBytes)}</>}
            </>
          )}
        </span>
        <Button size="sm" onClick={handleOpen} disabled={downloadMutation.isPending}>
          {isExternal ? (
            <>
              <ExternalLink className="size-3.5" /> Open
            </>
          ) : (
            <>
              <Download className="size-3.5" /> Download
            </>
          )}
        </Button>
      </div>
      {error && <p className="text-xs text-incorrect-600">{error}</p>}
    </Card>
  );
}
