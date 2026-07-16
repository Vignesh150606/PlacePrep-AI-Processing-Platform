import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Flag, MessageSquare, Pencil, ShieldCheck, ThumbsUp, Trash2, User } from "lucide-react";
import type { CommunityComment } from "@placeprep/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  useCreateCommunityComment,
  useDeleteCommunityComment,
  useReportCommunityComment,
  useUpdateCommunityComment,
  useVoteCommunityComment,
} from "@/hooks/use-community";
import { formatRelativeTime } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const textareaClass =
  "min-h-16 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface CommunityCommentThreadProps {
  postId: string;
  comments: CommunityComment[];
  isLocked: boolean;
  currentUserId: string | undefined;
  isAdmin: boolean;
}

/** Builds the nested-reply tree client-side from `parentCommentId` -- the
 * backend returns a flat, chronologically-ordered list (see
 * community.py's `list_comments` docstring for why). */
function useCommentTree(comments: CommunityComment[]) {
  return useMemo(() => {
    const byParent = new Map<string, CommunityComment[]>();
    for (const comment of comments) {
      const key = comment.parentCommentId ?? "root";
      const bucket = byParent.get(key) ?? [];
      bucket.push(comment);
      byParent.set(key, bucket);
    }
    return byParent;
  }, [comments]);
}

export function CommunityCommentThread({ postId, comments, isLocked, currentUserId, isAdmin }: CommunityCommentThreadProps) {
  const byParent = useCommentTree(comments);
  const roots = byParent.get("root") ?? [];
  const createComment = useCreateCommunityComment();
  const [newComment, setNewComment] = useState("");

  function submitTopLevel() {
    if (!newComment.trim()) return;
    createComment.mutate(
      { postId, content: newComment.trim() },
      {
        onSuccess: () => setNewComment(""),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't post your reply."),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">{comments.length} {comments.length === 1 ? "reply" : "replies"}</h2>

      {isLocked ? (
        <p className="rounded-lg border border-border-subtle bg-surface p-3 text-sm text-muted-foreground">
          This discussion is locked and no longer accepting replies.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            className={textareaClass}
            rows={3}
            placeholder="Share your answer or ask a follow-up..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <Button size="sm" className="w-fit" disabled={createComment.isPending} onClick={submitTopLevel}>
            {createComment.isPending ? "Posting..." : "Post reply"}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {roots.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            postId={postId}
            byParent={byParent}
            isLocked={isLocked}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}

interface CommentItemProps {
  comment: CommunityComment;
  postId: string;
  byParent: Map<string, CommunityComment[]>;
  isLocked: boolean;
  currentUserId: string | undefined;
  isAdmin: boolean;
  depth: number;
}

function CommentItem({ comment, postId, byParent, isLocked, currentUserId, isAdmin, depth }: CommentItemProps) {
  const children = byParent.get(comment.id) ?? [];
  const vote = useVoteCommunityComment();
  const createComment = useCreateCommunityComment();
  const updateComment = useUpdateCommunityComment();
  const deleteComment = useDeleteCommunityComment();
  const report = useReportCommunityComment();

  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);

  const authorName = comment.isAnonymous ? "Anonymous" : comment.authorName || "Unknown";
  const initials = authorName.slice(0, 1).toUpperCase();
  const canModify = comment.authorId === currentUserId || isAdmin;

  function submitReply() {
    if (!replyText.trim()) return;
    createComment.mutate(
      { postId, content: replyText.trim(), parentCommentId: comment.id },
      {
        onSuccess: () => {
          setReplyText("");
          setReplying(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't post your reply."),
      },
    );
  }

  function submitEdit() {
    if (!editText.trim()) return;
    updateComment.mutate(
      { commentId: comment.id, content: editText.trim() },
      { onSuccess: () => setEditing(false), onError: () => toast.error("Couldn't save your edit.") },
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", depth > 0 && "ml-6 border-l border-border-subtle pl-4")}>
      <div className="flex items-start gap-2">
        <Avatar className="size-7">
          {!comment.isAnonymous && comment.authorAvatarUrl && <AvatarImage src={comment.authorAvatarUrl} />}
          <AvatarFallback className="text-[10px]">
            {comment.isAnonymous ? <User className="size-3.5" /> : initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-xs">
            <span className={cn("font-medium text-foreground", comment.isAuthorVerifiedAlumni && "text-accent-700 dark:text-accent-400")}>
              {authorName}
            </span>
            {comment.isAuthorVerifiedAlumni && <ShieldCheck className="size-3.5 text-accent-600" aria-label="Verified alumnus" />}
            <span className="text-muted-foreground">
              · {formatRelativeTime(comment.createdAt)}
              {comment.editedAt && " (edited)"}
            </span>
          </div>

          {editing ? (
            <div className="mt-1 flex flex-col gap-2">
              <textarea className={textareaClass} rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" disabled={updateComment.isPending} onClick={submitEdit}>
                  Save
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{comment.content}</p>
          )}

          <div className="mt-1 flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => vote.mutate({ commentId: comment.id, voteType: "helpful" })}
              className={cn(comment.myVote === "helpful" && "text-accent-700 dark:text-accent-400")}
            >
              <ThumbsUp className="size-3.5" /> {comment.helpfulCount}
            </Button>
            {!isLocked && (
              <Button variant="ghost" size="sm" onClick={() => setReplying((v) => !v)}>
                <MessageSquare className="size-3.5" /> Reply
              </Button>
            )}
            {canModify && !editing && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" />
              </Button>
            )}
            {canModify && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm("Delete this reply?")) deleteComment.mutate(comment.id);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
            {comment.authorId !== currentUserId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const reason = window.prompt("Why are you reporting this reply?");
                  if (reason?.trim()) {
                    report.mutate(
                      { commentId: comment.id, reason: reason.trim() },
                      { onSuccess: () => toast.success("Reported. An admin will review it.") },
                    );
                  }
                }}
              >
                <Flag className="size-3.5" />
              </Button>
            )}
          </div>

          {replying && (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                className={textareaClass}
                rows={2}
                placeholder={`Reply to ${authorName}...`}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={createComment.isPending} onClick={submitReply}>
                  Post reply
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setReplying(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {children.length > 0 && (
        <div className="flex flex-col gap-3">
          {children.map((child) => (
            <CommentItem
              key={child.id}
              comment={child}
              postId={postId}
              byParent={byParent}
              isLocked={isLocked}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
