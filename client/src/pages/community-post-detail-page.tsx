import { useState } from "react";
import { toast } from "sonner";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  Bookmark,
  Building2,
  Download,
  Eye,
  Flag,
  Lock,
  Paperclip,
  Pencil,
  Pin,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
} from "lucide-react";
import { COMMUNITY_CATEGORIES } from "@placeprep/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CommunityCommentThread } from "@/components/community/community-comment-thread";
import {
  useCommunityComments,
  useCommunityPost,
  useDeleteCommunityPost,
  useDownloadCommunityAttachment,
  useReportCommunityPost,
  useUpdateCommunityPost,
  useVoteCommunityPost,
} from "@/hooks/use-community";
import { Input } from "@/components/ui/input";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useIsAdmin, useProfile } from "@/hooks/use-profile";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL = new Map(COMMUNITY_CATEGORIES.map((c) => [c.value, c.label]));

export function CommunityPostDetailPage() {
  const { postId } = useParams({ from: "/app-layout/community/$postId" });
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const isAdmin = useIsAdmin();
  const { data: post, isLoading, isError, refetch } = useCommunityPost(postId);
  const { data: commentData } = useCommunityComments(postId);
  const { isBookmarked, toggle } = useBookmarks();
  const vote = useVoteCommunityPost();
  const report = useReportCommunityPost();
  const deletePost = useDeleteCommunityPost();
  const updatePost = useUpdateCommunityPost();
  const downloadAttachment = useDownloadCommunityAttachment();
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (isError || !post) {
    return <ErrorState description="We couldn't load this discussion." onRetry={() => refetch()} />;
  }

  const authorName = post.isAnonymous ? "Anonymous" : post.authorName || "Unknown";
  const initials = authorName.slice(0, 1).toUpperCase();
  const canModify = post.authorId === profile?.id || isAdmin;

  async function handleDownload(index: number) {
    setAttachmentError(null);
    try {
      const result = await downloadAttachment.mutateAsync({ postId: post!.id, index });
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      setAttachmentError("Couldn't open that attachment. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-6">
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
          {post.companyName && (
            <Badge variant="neutral">
              <Building2 className="size-3" /> {post.companyName}
            </Badge>
          )}
        </div>

        {!editing && <h1 className="text-lg font-semibold text-foreground">{post.title}</h1>}
        {editing ? (
          <div className="flex flex-col gap-2">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <textarea
              className="min-h-28 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={5}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={updatePost.isPending}
                onClick={() =>
                  updatePost.mutate(
                    { postId: post.id, title: editTitle.trim(), description: editDescription.trim() },
                    {
                      onSuccess: () => {
                        toast.success("Post updated.");
                        setEditing(false);
                      },
                      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save your edit."),
                    },
                  )
                }
              >
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-foreground">{post.description}</p>
        )}

        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="neutral" className="text-[11px]">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {post.attachments.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {post.attachments.map((attachment, index) => (
              <button
                key={`${attachment.fileName}-${index}`}
                onClick={() => handleDownload(index)}
                className="flex w-fit items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-xs text-muted-foreground hover:border-accent-600"
              >
                <Paperclip className="size-3.5" />
                {attachment.fileName}
                <Download className="size-3.5" />
              </button>
            ))}
            {attachmentError && <p className="text-xs text-incorrect-600">{attachmentError}</p>}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Avatar className="size-6">
              {!post.isAnonymous && post.authorAvatarUrl && <AvatarImage src={post.authorAvatarUrl} />}
              <AvatarFallback className="text-[10px]">{post.isAnonymous ? <User className="size-3.5" /> : initials}</AvatarFallback>
            </Avatar>
            <span className={cn("flex items-center gap-1", post.isAuthorVerifiedAlumni && "font-medium text-accent-700 dark:text-accent-400")}>
              {authorName}
              {post.isAuthorVerifiedAlumni && <ShieldCheck className="size-3.5" aria-label="Verified alumnus" />}
              {post.authorMentorshipAvailable && <span className="text-[10px] text-muted-foreground">· open to mentoring</span>}
            </span>
            <span>· {formatDate(post.createdAt)}</span>
            <span className="flex items-center gap-1">
              <Eye className="size-3.5" /> {post.viewCount}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => vote.mutate({ postId: post.id, voteType: "helpful" })}
            className={cn(post.myVote === "helpful" && "text-accent-700 dark:text-accent-400")}
          >
            <ThumbsUp className="size-3.5" /> {post.helpfulCount}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => vote.mutate({ postId: post.id, voteType: "not-helpful" })}
            className={cn(post.myVote === "not-helpful" && "text-incorrect-600")}
          >
            <ThumbsDown className="size-3.5" /> {post.notHelpfulCount}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => toggle(post.id, "community-post")}>
            <Bookmark className={cn("size-3.5", isBookmarked(post.id) && "fill-current")} />
          </Button>
          {post.authorId !== profile?.id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const reason = window.prompt("Why are you reporting this post?");
                if (reason?.trim()) {
                  report.mutate(
                    { postId: post.id, reason: reason.trim() },
                    { onSuccess: () => toast.success("Reported. An admin will review it.") },
                  );
                }
              }}
            >
              <Flag className="size-3.5" />
            </Button>
          )}
          {canModify && (
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditTitle(post.title);
                  setEditDescription(post.description);
                  setEditing(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm("Delete this post? This can't be undone.")) {
                    deletePost.mutate(post.id, {
                      onSuccess: () => {
                        toast.success("Post deleted.");
                        navigate({ to: "/community" });
                      },
                      onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete post."),
                    });
                  }
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </Card>

      <CommunityCommentThread
        postId={post.id}
        comments={commentData?.items ?? []}
        isLocked={post.isLocked}
        currentUserId={profile?.id}
        isAdmin={isAdmin}
      />
    </div>
  );
}
