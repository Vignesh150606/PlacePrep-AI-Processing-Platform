import { Link } from "@tanstack/react-router";
import { Eye, Lock, MessageSquare, Pin, ShieldCheck, ThumbsDown, ThumbsUp, User } from "lucide-react";
import type { CommunityPost } from "@placeprep/shared";
import { COMMUNITY_CATEGORIES } from "@placeprep/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL = new Map(COMMUNITY_CATEGORIES.map((c) => [c.value, c.label]));

interface CommunityPostCardProps {
  post: CommunityPost;
  /** Hide the company badge when the card already lives inside that
   * company's own Community tab -- redundant there, same reasoning
   * `ResourceCard`'s `hideCompanyBadge` prop uses. */
  hideCompanyBadge?: boolean;
}

export function CommunityPostCard({ post, hideCompanyBadge }: CommunityPostCardProps) {
  const authorName = post.isAnonymous ? "Anonymous" : post.authorName || "Unknown";
  const initials = authorName.slice(0, 1).toUpperCase();

  return (
    <Link to="/community/$postId" params={{ postId: post.id }} className="block">
      <Card className="flex flex-col gap-3 p-5 transition-colors hover:border-accent-600/40">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.isPinned && (
            <Badge variant="warning">
              <Pin className="size-3" /> Pinned
            </Badge>
          )}
          {post.isLocked && (
            <Badge variant="neutral">
              <Lock className="size-3" /> Locked
            </Badge>
          )}
          <Badge variant="accent">{CATEGORY_LABEL.get(post.category) ?? post.category}</Badge>
          {!hideCompanyBadge && post.companyName && <Badge variant="neutral">{post.companyName}</Badge>}
        </div>

        <div>
          <h3 className="text-sm font-semibold leading-snug text-foreground">{post.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.description}</p>
        </div>

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="neutral" className="text-[11px]">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Avatar className="size-5">
              {!post.isAnonymous && post.authorAvatarUrl && <AvatarImage src={post.authorAvatarUrl} />}
              <AvatarFallback className="text-[10px]">{post.isAnonymous ? <User className="size-3" /> : initials}</AvatarFallback>
            </Avatar>
            <span className={cn("flex items-center gap-1", post.isAuthorVerifiedAlumni && "font-medium text-accent-700 dark:text-accent-400")}>
              {authorName}
              {post.isAuthorVerifiedAlumni && <ShieldCheck className="size-3.5" aria-label="Verified alumnus" />}
            </span>
            <span>· {formatRelativeTime(post.createdAt)}</span>
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ThumbsUp className="size-3.5" /> {post.helpfulCount}
            </span>
            {post.notHelpfulCount > 0 && (
              <span className="flex items-center gap-1">
                <ThumbsDown className="size-3.5" /> {post.notHelpfulCount}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3.5" /> {post.replyCount}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="size-3.5" /> {post.viewCount}
            </span>
          </span>
        </div>
      </Card>
    </Link>
  );
}
