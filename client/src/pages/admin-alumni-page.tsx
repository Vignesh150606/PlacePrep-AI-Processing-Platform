import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Handshake,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { AlumniProfile, AlumniVerificationStatus } from "@placeprep/shared";
import {
  useAdminUpdateAlumni,
  useAlumni,
  useAlumniAnalytics,
  useDeleteAlumni,
  useManualCreateAlumni,
  useUpdateAlumniStatus,
} from "@/hooks/use-alumni";
import { useAdminUsers } from "@/hooks/use-admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRelativeTime } from "@/lib/format";

const selectClass =
  "h-9 rounded-lg border border-border bg-surface-raised px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_LABEL: Record<AlumniVerificationStatus, string> = {
  "pending-review": "Pending review",
  verified: "Verified",
  rejected: "Rejected",
  suspended: "Suspended",
};

function RejectDialog({ alumniId, open, onOpenChange }: { alumniId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState("");
  const updateStatus = useUpdateAlumniStatus();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this request</DialogTitle>
          <DialogDescription>Shown to the student who requested verification.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Input id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!reason.trim() || updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate(
                { alumniId, status: "rejected", rejectionReason: reason.trim() },
                { onSuccess: () => { toast.success("Request rejected."); onOpenChange(false); } },
              )
            }
          >
            Reject
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Admin edit -- a focused subset of fields (the ones most likely to need
 * a correction), not the full self-service form -- same "smaller edit
 * surface than the submission form" precedent
 * `admin-resources-page.tsx`'s `EditResourceDialog` sets. */
function EditAlumniDialog({ alumni, open, onOpenChange }: { alumni: AlumniProfile | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useAdminUpdateAlumni();
  const [currentRole, setCurrentRole] = useState("");
  const [department, setDepartment] = useState("");
  const [graduationYear, setGraduationYear] = useState("");

  if (!alumni) return null;

  function handleOpenAutoFocus() {
    setCurrentRole(alumni!.currentRole);
    setDepartment(alumni!.department ?? "");
    setGraduationYear(String(alumni!.graduationYear));
  }

  function handleSave() {
    if (!alumni) return;
    update.mutate(
      {
        alumniId: alumni.id,
        currentRole: currentRole || undefined,
        department: department || undefined,
        graduationYear: graduationYear ? Number(graduationYear) : undefined,
      },
      {
        onSuccess: () => { toast.success("Alumni profile updated."); onOpenChange(false); },
        onError: () => toast.error("Couldn't save changes."),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) handleOpenAutoFocus(); onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit alumni profile</DialogTitle>
          <DialogDescription>The alumnus can also keep this current from their own directory page.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-role">Current role</Label>
            <Input id="edit-role" value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-department">Department</Label>
            <Input id="edit-department" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-year">Graduation year</Label>
            <Input id="edit-year" type="number" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={update.isPending} className="w-fit">
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Admin "Manual verification" -- creates AND verifies a profile for any
 * existing user in one step, covering only the essentials; the alumnus can
 * enrich the rest of their own profile afterward via self-edit. */
function ManualCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [userSearch, setUserSearch] = useState("");
  const [profileId, setProfileId] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [currentCompanyName, setCurrentCompanyName] = useState("");
  const [department, setDepartment] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const { data: userData } = useAdminUsers({ page: 1, pageSize: 10, search: userSearch || undefined });
  const manualCreate = useManualCreateAlumni();

  function reset() {
    setUserSearch("");
    setProfileId("");
    setCurrentRole("");
    setCurrentCompanyName("");
    setDepartment("");
    setGraduationYear("");
  }

  function handleSave() {
    if (!profileId || !currentRole || !graduationYear) return;
    manualCreate.mutate(
      {
        profileId,
        currentRole,
        currentCompanyName: currentCompanyName || undefined,
        department: department || undefined,
        graduationYear: Number(graduationYear),
      },
      {
        onSuccess: () => { toast.success("Alumni profile created and verified."); reset(); onOpenChange(false); },
        onError: () => toast.error("Couldn't create this profile -- they may already have one."),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manually verify an alumnus</DialogTitle>
          <DialogDescription>
            For alumni who can't self-submit (e.g. no longer using their account) -- creates a verified profile
            immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-user-search">Find student</Label>
            <Input
              id="manual-user-search"
              placeholder="Search by name or email"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            {userData && userData.items.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-border-subtle p-1">
                {userData.items.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setProfileId(u.id)}
                    className={`rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface ${
                      profileId === u.id ? "bg-accent-600/10 text-accent-700" : "text-foreground"
                    }`}
                  >
                    {u.fullName} <span className="text-xs text-muted-foreground">{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-role">Current role</Label>
            <Input id="manual-role" value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-company">Current company</Label>
            <Input id="manual-company" value={currentCompanyName} onChange={(e) => setCurrentCompanyName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-department">Department</Label>
              <Input id="manual-department" value={department} onChange={(e) => setDepartment(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-year">Graduation year</Label>
              <Input id="manual-year" type="number" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={!profileId || !currentRole || !graduationYear || manualCreate.isPending}
            className="w-fit"
          >
            Create and verify
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminAlumniPage() {
  const [statusFilter, setStatusFilter] = useState<AlumniVerificationStatus>("pending-review");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [editing, setEditing] = useState<AlumniProfile | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useAlumni({ status: statusFilter, pageSize: 100 });
  const { data: analytics } = useAlumniAnalytics();
  const updateStatus = useUpdateAlumniStatus();
  const remove = useDeleteAlumni();

  const alumni = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Alumni Verification</h1>
          <p className="text-sm text-muted-foreground">
            Review alumni requests, manage verified profiles, and track contribution activity.
          </p>
        </div>
        <Button size="sm" onClick={() => setManualOpen(true)}>
          <UserPlus className="size-4" /> Manual verification
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total alumni" value={analytics?.totalAlumni ?? 0} icon={ShieldCheck} />
        <StatCard label="Verified" value={analytics?.verifiedAlumni ?? 0} icon={CheckCircle2} />
        <StatCard label="Companies represented" value={analytics?.companiesRepresented ?? 0} icon={ShieldAlert} />
        <StatCard label="Open to mentor" value={analytics?.mentorshipAvailableCount ?? 0} icon={Handshake} />
      </div>

      <select
        className={selectClass}
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as AlumniVerificationStatus)}
      >
        {(Object.keys(STATUS_LABEL) as AlumniVerificationStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState description="We couldn't load the alumni queue." onRetry={() => refetch()} />
      ) : alumni.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing here"
          description={
            statusFilter === "pending-review"
              ? "No alumni requests are waiting for verification right now."
              : `No ${STATUS_LABEL[statusFilter].toLowerCase()} alumni.`
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {alumni.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="accent">{a.currentRole}</Badge>
                  {a.currentCompanyName && <Badge variant="neutral">{a.currentCompanyName}</Badge>}
                  <Badge variant="neutral">Class of {a.graduationYear}</Badge>
                  {a.mentorshipAvailable && <Badge variant="neutral">Open to mentor</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {a.isAnonymous ? "Anonymous" : a.fullName} · {a.email} · submitted{" "}
                    {formatRelativeTime(a.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {a.contributionCount} contribution(s) · {a.helpfulVotesReceived} helpful vote(s)
                </p>
                {a.verificationStatus === "rejected" && a.rejectionReason && (
                  <p className="text-xs text-incorrect-600">Rejected: {a.rejectionReason}</p>
                )}

                <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
                  {a.verificationStatus === "pending-review" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateStatus.mutate(
                          { alumniId: a.id, status: "verified" },
                          { onSuccess: () => toast.success("Verified -- now visible in the directory.") },
                        )
                      }
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle2 className="size-3.5" /> Verify
                    </Button>
                  )}
                  {a.verificationStatus === "pending-review" && (
                    <Button variant="secondary" size="sm" onClick={() => setRejecting(a.id)}>
                      <XCircle className="size-3.5" /> Reject
                    </Button>
                  )}
                  {a.verificationStatus === "verified" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        updateStatus.mutate(
                          { alumniId: a.id, status: "suspended" },
                          { onSuccess: () => toast.success("Suspended.") },
                        )
                      }
                      disabled={updateStatus.isPending}
                    >
                      <ShieldX className="size-3.5" /> Suspend
                    </Button>
                  )}
                  {(a.verificationStatus === "verified" || a.verificationStatus === "suspended" || a.verificationStatus === "rejected") && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        updateStatus.mutate(
                          { alumniId: a.id, status: "pending-review" },
                          { onSuccess: () => toast.success("Moved back to pending review.") },
                        )
                      }
                      disabled={updateStatus.isPending}
                    >
                      <RotateCcw className="size-3.5" /> Remove verification
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setEditing(a)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`Delete ${a.isAnonymous ? "this alumnus" : a.fullName}'s profile? This can't be undone.`)) {
                        remove.mutate(a.id, { onSuccess: () => toast.success("Alumni profile deleted.") });
                      }
                    }}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {rejecting && (
        <RejectDialog alumniId={rejecting} open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)} />
      )}
      <EditAlumniDialog alumni={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />
      <ManualCreateDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}
