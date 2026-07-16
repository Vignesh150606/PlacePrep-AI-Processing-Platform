import { useState } from "react";
import { toast } from "sonner";
import {
  Flag,
  Lock,
  MessageSquare,
  MessagesSquare,
  Pin,
  ShieldX,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCommunityAnalytics,
  useDeleteCommunityComment,
  useDeleteCommunityPost,
  useDismissCommentReports,
  useDismissPostReports,
  useModerateCommunityPost,
  useReportedCommunityComments,
  useReportedCommunityPosts,
  useSuspendCommunityUser,
} from "@/hooks/use-community";
import { formatRelativeTime } from "@/lib/format";

function SuspendDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const suspend = useSuspendCommunityUser();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend this user from Community</DialogTitle>
          <DialogDescription>
            They'll be unable to post new discussions or replies until you restore access.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="suspend-reason">Reason</Label>
          <Input id="suspend-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!reason.trim() || !userId || suspend.isPending}
            onClick={() =>
              userId &&
              suspend.mutate(
                { userId, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success("User suspended from Community.");
                    setReason("");
                    onOpenChange(false);
                  },
                },
              )
            }
          >
            Suspend
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Admin Community moderation (Phase 12) -- extends the existing Admin
 * Portal (same "own path under /admin, not a separate admin system"
 * pattern `AdminResourcesPage`/`AdminAlumniPage` set). Reactive
 * moderation only: reported posts/comments plus pin/lock/delete/suspend
 * -- there's no approval queue here because Community content is never
 * pending in the first place (see community.py's module docstring).
 */
export function AdminCommunityPage() {
  const { data: analytics } = useCommunityAnalytics();
  const { data: reportedPosts, isLoading: postsLoading, isError: postsError, refetch: refetchPosts } =
    useReportedCommunityPosts();
  const { data: reportedComments, isLoading: commentsLoading, isError: commentsError, refetch: refetchComments } =
    useReportedCommunityComments();

  const moderatePost = useModerateCommunityPost();
  const deletePost = useDeleteCommunityPost();
  const dismissPostReports = useDismissPostReports();
  const deleteComment = useDeleteCommunityComment();
  const dismissCommentReports = useDismissCommentReports();

  const [suspendUserId, setSuspendUserId] = useState<string | null>(null);

  const posts = reportedPosts ?? [];
  const comments = reportedComments ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Community Moderation</h1>
        <p className="text-sm text-muted-foreground">
          Review reported posts and replies, pin or lock discussions, and manage posting access.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total posts" value={analytics?.totalPosts ?? 0} icon={MessagesSquare} />
        <StatCard label="Total replies" value={analytics?.totalComments ?? 0} icon={MessageSquare} />
        <StatCard label="Active this month" value={analytics?.activeUsersLast30Days ?? 0} icon={Users} />
        <StatCard label="Reported items" value={posts.length + comments.length} icon={Flag} />
      </div>

      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">Reported posts ({posts.length})</TabsTrigger>
          <TabsTrigger value="comments">Reported replies ({comments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          {postsLoading ? (
            <div className="flex flex-col gap-3">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : postsError ? (
            <ErrorState description="We couldn't load reported posts." onRetry={() => refetchPosts()} />
          ) : posts.length === 0 ? (
            <EmptyState icon={Flag} title="Nothing reported" description="No posts are currently flagged for review." />
          ) : (
            <div className="flex flex-col gap-3">
              {posts.map(({ post, reportCount, reasons }) => (
                <Card key={post.id} className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="incorrect">{reportCount} report(s)</Badge>
                    {post.isPinned && <Badge variant="warning">Pinned</Badge>}
                    {post.isLocked && <Badge variant="neutral">Locked</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {post.isAnonymous ? "Anonymous" : post.authorName} · {formatRelativeTime(post.createdAt)}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{post.title}</h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{post.description}</p>
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {reasons.map((reason, i) => (
                      <li key={i}>"{reason}"</li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => moderatePost.mutate({ postId: post.id, isPinned: !post.isPinned })}
                    >
                      <Pin className="size-3.5" /> {post.isPinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => moderatePost.mutate({ postId: post.id, isLocked: !post.isLocked })}
                    >
                      {post.isLocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                      {post.isLocked ? "Unlock" : "Lock"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        dismissPostReports.mutate(post.id, { onSuccess: () => toast.success("Reports dismissed.") })
                      }
                    >
                      Dismiss reports
                    </Button>
                    {post.authorId && (
                      <Button variant="secondary" size="sm" onClick={() => setSuspendUserId(post.authorId!)}>
                        <ShieldX className="size-3.5" /> Suspend author
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (window.confirm("Delete this post? This can't be undone.")) {
                          deletePost.mutate(post.id, { onSuccess: () => toast.success("Post deleted.") });
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comments">
          {commentsLoading ? (
            <div className="flex flex-col gap-3">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : commentsError ? (
            <ErrorState description="We couldn't load reported replies." onRetry={() => refetchComments()} />
          ) : comments.length === 0 ? (
            <EmptyState icon={Flag} title="Nothing reported" description="No replies are currently flagged for review." />
          ) : (
            <div className="flex flex-col gap-3">
              {comments.map(({ comment, postId, reportCount, reasons }) => (
                <Card key={comment.id} className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="incorrect">{reportCount} report(s)</Badge>
                    <span className="text-xs text-muted-foreground">
                      {comment.isAnonymous ? "Anonymous" : comment.authorName} · {formatRelativeTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-sm text-foreground">{comment.content}</p>
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {reasons.map((reason, i) => (
                      <li key={i}>"{reason}"</li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
                    <Button variant="secondary" size="sm" onClick={() => window.open(`/community/${postId}`, "_blank")}>
                      View in context
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        dismissCommentReports.mutate(comment.id, {
                          onSuccess: () => toast.success("Reports dismissed."),
                        })
                      }
                    >
                      Dismiss reports
                    </Button>
                    {comment.authorId && (
                      <Button variant="secondary" size="sm" onClick={() => setSuspendUserId(comment.authorId!)}>
                        <ShieldX className="size-3.5" /> Suspend author
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (window.confirm("Delete this reply? This can't be undone.")) {
                          deleteComment.mutate(comment.id, { onSuccess: () => toast.success("Reply deleted.") });
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <SuspendDialog userId={suspendUserId} open={!!suspendUserId} onOpenChange={(open) => !open && setSuspendUserId(null)} />
    </div>
  );
}
