import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import type { UserIdentity } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Bell,
  Download,
  FileText,
  Gavel,
  GraduationCap,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  ScrollText,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useProfile, useUpdateProfile, useIsAdmin } from "@/hooks/use-profile";
import { useSettings, useUpdateSettings, useExportData, useDeleteAccount } from "@/hooks/use-settings";
import { useAccessibility } from "@/hooks/use-accessibility";
import { useTheme } from "@/hooks/use-theme";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  const isAdmin = useIsAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account, notifications, and preferences.</p>
      </div>

      <Tabs defaultValue="account">
        <TabsList className="flex-wrap">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="privacy">Privacy & Data</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin">Admin</TabsTrigger>}
        </TabsList>

        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="privacy">
          <PrivacyDataTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="admin">
            <AdminTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// =============================================================================
// Account -- the EXISTING PATCH /profiles/me (profiles.py), which never had a
// client hook or a form in front of it until now.
// =============================================================================

const accountSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(120),
  avatarUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\//.test(v), "Enter a valid URL starting with http:// or https://"),
  college: z.string().trim().max(160),
  department: z.string().trim().max(120),
  year: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}$/.test(v), "Enter a 4-digit year"),
});
type AccountFormValues = z.infer<typeof accountSchema>;

function AccountTab() {
  const { user } = useAuth();
  const { data: profile, isLoading, isError, refetch } = useProfile();
  const updateProfile = useUpdateProfile();

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    values: profile
      ? {
          fullName: profile.fullName,
          avatarUrl: profile.avatarUrl ?? "",
          college: profile.college ?? "",
          department: profile.department ?? "",
          year: profile.year ? String(profile.year) : "",
        }
      : undefined,
  });

  function onSubmit(values: AccountFormValues) {
    updateProfile.mutate(
      {
        fullName: values.fullName,
        avatarUrl: values.avatarUrl || null,
        college: values.college || null,
        department: values.department || null,
        year: values.year ? Number(values.year) : null,
      },
      {
        onSuccess: () => toast.success("Profile updated."),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update your profile."),
      },
    );
  }

  if (isLoading) return <SettingsCardSkeleton />;
  if (isError || !profile) {
    return <ErrorState description="We couldn't load your profile." onRetry={refetch} />;
  }

  const avatarPreview = form.watch("avatarUrl");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Your name and photo are what admins and other students see on your submissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <img
              src={avatarPreview || user?.avatarUrl || "/logo.png"}
              alt=""
              className="size-14 shrink-0 rounded-full border border-border object-cover"
            />
            <div className="flex-1">
              <Label htmlFor="avatarUrl">Avatar URL</Label>
              <Input
                id="avatarUrl"
                placeholder="https://..."
                {...form.register("avatarUrl")}
                className="mt-1.5"
              />
              {form.formState.errors.avatarUrl && (
                <p className="mt-1 text-xs text-incorrect-500">{form.formState.errors.avatarUrl.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" {...form.register("fullName")} className="mt-1.5" />
              {form.formState.errors.fullName && (
                <p className="mt-1 text-xs text-incorrect-500">{form.formState.errors.fullName.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email ?? ""} disabled className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="college">College</Label>
              <Input id="college" {...form.register("college")} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="department">Department</Label>
              <Input id="department" {...form.register("department")} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="year">Graduation year</Label>
              <Input id="year" inputMode="numeric" placeholder="2027" {...form.register("year")} className="mt-1.5" />
              {form.formState.errors.year && (
                <p className="mt-1 text-xs text-incorrect-500">{form.formState.errors.year.message}</p>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={updateProfile.isPending || !form.formState.isDirty}>
            {updateProfile.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

// =============================================================================
// Security -- password change, Google account link/unlink, and "sign out of
// other devices" are all Supabase Auth actions (AuthContext), not
// PlacePrep-owned state -- there's nothing here for settings.py to serve.
// =============================================================================

const passwordSchema = z
  .object({
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type PasswordFormValues = z.infer<typeof passwordSchema>;

function SecurityTab() {
  const { updatePassword, signOutOtherSessions } = useAuth();
  const [isSigningOutOthers, setIsSigningOutOthers] = React.useState(false);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: PasswordFormValues) {
    try {
      await updatePassword(values.newPassword);
      toast.success("Password updated.");
      form.reset();
    } catch {
      toast.error("Couldn't update your password. Try signing out and back in, then retry.");
    }
  }

  async function handleSignOutOthers() {
    setIsSigningOutOthers(true);
    try {
      await signOutOtherSessions();
      toast.success("Signed out of all other devices.");
    } catch {
      toast.error("Couldn't sign out other sessions.");
    } finally {
      setIsSigningOutOthers(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Password
            </CardTitle>
            <CardDescription>
              Only applies if you signed up with email/password. If you use Google to sign in, manage your
              password with Google instead.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" type="password" {...form.register("newPassword")} className="mt-1.5" />
              {form.formState.errors.newPassword && (
                <p className="mt-1 text-xs text-incorrect-500">{form.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...form.register("confirmPassword")}
                className="mt-1.5"
              />
              {form.formState.errors.confirmPassword && (
                <p className="mt-1 text-xs text-incorrect-500">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Update password
            </Button>
          </CardFooter>
        </Card>
      </form>

      <ConnectedAccountsCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Laptop className="size-4" /> Sessions
          </CardTitle>
          <CardDescription>
            If you signed in on a device that isn't yours, sign it out from here without changing your password.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end border-t-0 pt-0">
          <Button variant="secondary" onClick={handleSignOutOthers} disabled={isSigningOutOthers}>
            {isSigningOutOthers ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            Sign out of all other devices
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function ConnectedAccountsCard() {
  const { getIdentities, linkGoogleIdentity, unlinkIdentity } = useAuth();
  const [unlinkingId, setUnlinkingId] = React.useState<string | null>(null);
  const { data: identities, isLoading, refetch } = useQuery({
    queryKey: ["auth", "identities"],
    queryFn: getIdentities,
    staleTime: 60_000,
  });

  const hasGoogle = identities?.some((i) => i.provider === "google") ?? false;
  const canUnlink = (identities?.length ?? 0) > 1;

  async function handleLink() {
    try {
      await linkGoogleIdentity();
    } catch {
      toast.error("Couldn't start Google linking.");
    }
  }

  async function handleUnlink(identity: UserIdentity) {
    setUnlinkingId(identity.identity_id);
    try {
      await unlinkIdentity(identity);
      toast.success("Google account disconnected.");
      refetch();
    } catch {
      toast.error("Couldn't disconnect that account.");
    } finally {
      setUnlinkingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" /> Connected Accounts
        </CardTitle>
        <CardDescription>Sign-in methods linked to your PlacePrep account.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="font-medium">Google</span>
              {hasGoogle && <Badge variant="correct">Connected</Badge>}
            </div>
            {hasGoogle ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={!canUnlink || unlinkingId !== null}
                title={!canUnlink ? "Set a password first so you always have a way to sign in" : undefined}
                onClick={() => {
                  const identity = identities?.find((i) => i.provider === "google");
                  if (identity) void handleUnlink(identity);
                }}
              >
                {unlinkingId !== null && <Loader2 className="size-4 animate-spin" />}
                Disconnect
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={handleLink}>
                Connect
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Notifications -- gates exactly the two discretionary categories
// notify()/notify_admins() (services/notifications.py) actually checks.
// =============================================================================

function NotificationsTab() {
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();

  if (isLoading) return <SettingsCardSkeleton />;
  if (isError || !settings) {
    return <ErrorState description="We couldn't load your notification preferences." onRetry={refetch} />;
  }

  function toggle(key: "contentUpdates" | "communityActivity", value: boolean) {
    updateSettings.mutate(
      { notificationPrefs: { ...settings!.notificationPrefs, [key]: value } },
      { onError: () => toast.error("Couldn't update that preference.") },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" /> Notifications
        </CardTitle>
        <CardDescription>
          These only control the in-app notification bell -- PlacePrep doesn't send email. Updates about your
          own submissions (approvals, rejections, moderation) always notify you, since muting those would hide
          things you need to see.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border-subtle">
        <SettingRow
          title="Content & discovery"
          description="New companies added, new resources, placement calendar updates."
        >
          <Switch
            checked={settings.notificationPrefs.contentUpdates}
            onCheckedChange={(v) => toggle("contentUpdates", v)}
          />
        </SettingRow>
        <SettingRow title="Community replies" description="Someone replied to your post or comment.">
          <Switch
            checked={settings.notificationPrefs.communityActivity}
            onCheckedChange={(v) => toggle("communityActivity", v)}
          />
        </SettingRow>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Appearance -- theme (already existed, theme-context.ts) + accessibility
// (new, accessibility-context.ts). Both client-only, nothing to save server-side.
// =============================================================================

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const { reducedMotion, setReducedMotion, fontSize, setFontSize } = useAccessibility();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Applies immediately across the app on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1">
            {(
              [
                { value: "light" as const, label: "Light", icon: Sun },
                { value: "dark" as const, label: "Dark", icon: Moon },
                { value: "system" as const, label: "System", icon: Monitor },
              ]
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  theme === value
                    ? "bg-surface-raised text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accessibility</CardTitle>
          <CardDescription>Stored on this device only.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SettingRow title="Reduce motion" description="Turns off animation and slide/fade transitions.">
            <Switch checked={reducedMotion} onCheckedChange={setReducedMotion} />
          </SettingRow>
          <div className="flex items-center justify-between border-t border-border-subtle pt-4">
            <div>
              <p className="text-sm font-medium text-foreground">Font size</p>
              <p className="text-sm text-muted-foreground">Scales all text across the app.</p>
            </div>
            <div className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1">
              {(["sm", "md", "lg"] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setFontSize(size)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    fontSize === size
                      ? "bg-surface-raised text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {size === "sm" ? "Small" : size === "md" ? "Medium" : "Large"}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Privacy & Data
// =============================================================================

function PrivacyDataTab() {
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const updateSettings = useUpdateSettings();

  if (isLoading) return <SettingsCardSkeleton />;
  if (isError || !settings) {
    return <ErrorState description="We couldn't load your privacy settings." onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border-subtle">
          <SettingRow
            title="Post interview experiences anonymously by default"
            description="You can still change it per-post when you submit -- this just sets the starting value."
          >
            <Switch
              checked={settings.defaultAnonymousInterview}
              onCheckedChange={(v) =>
                updateSettings.mutate(
                  { defaultAnonymousInterview: v },
                  { onError: () => toast.error("Couldn't update that preference.") },
                )
              }
            />
          </SettingRow>
          {settings.alumniDirectoryVisible !== null && (
            <SettingRow
              title="Show me in the Alumni Directory"
              description="Turning this off hides you from students browsing the directory -- it doesn't affect your verified badge or mentorship eligibility."
            >
              <Switch
                checked={settings.alumniDirectoryVisible}
                onCheckedChange={(v) =>
                  updateSettings.mutate(
                    { alumniDirectoryVisible: v },
                    { onError: () => toast.error("Couldn't update that preference.") },
                  )
                }
              />
            </SettingRow>
          )}
        </CardContent>
      </Card>

      <ExportDataCard />
      <DangerZoneCard />
    </div>
  );
}

function ExportDataCard() {
  const exportData = useExportData();

  async function handleExport() {
    try {
      const data = await exportData.mutateAsync();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `placeprep-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't export your data.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="size-4" /> Your data
        </CardTitle>
        <CardDescription>
          Download a copy of your profile, quiz attempts, bookmarks, and submissions as a JSON file.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end border-t-0 pt-0">
        <Button variant="secondary" onClick={handleExport} disabled={exportData.isPending}>
          {exportData.isPending && <Loader2 className="size-4 animate-spin" />}
          Download my data
        </Button>
      </CardFooter>
    </Card>
  );
}

function DangerZoneCard() {
  const deleteAccount = useDeleteAccount();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = React.useState("");
  const [open, setOpen] = React.useState(false);

  async function handleDelete() {
    try {
      await deleteAccount.mutateAsync();
      await signOut();
      toast.success("Your account has been deleted.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete your account.");
    }
  }

  return (
    <Card className="border-incorrect-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-incorrect-500">
          <AlertTriangle className="size-4" /> Danger zone
        </CardTitle>
        <CardDescription>
          Permanently deletes your profile, quiz history, bookmarks, and submissions. This can't be undone.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end border-t-0 pt-0">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="size-4" /> Delete account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This permanently deletes your account and everything tied to it. Type DELETE to confirm.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={confirmText !== "DELETE" || deleteAccount.isPending}
                onClick={handleDelete}
              >
                {deleteAccount.isPending && <Loader2 className="size-4 animate-spin" />}
                Permanently delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}

// =============================================================================
// Admin -- quick links into the EXISTING Admin Portal (admin-dashboard-page,
// admin-review-page, etc.). No new admin config system -- Settings just
// surfaces the doors that already exist elsewhere in the nav.
// =============================================================================

const ADMIN_LINKS = [
  { to: "/admin", label: "Admin Dashboard", description: "Platform-wide stats and activity.", icon: UserCog },
  { to: "/admin/review", label: "Review Queue", description: "Approve or reject pending questions.", icon: Gavel },
  { to: "/admin/resources", label: "Resource Moderation", description: "Review submitted study resources.", icon: FileText },
  { to: "/admin/alumni", label: "Alumni Verification", description: "Verify alumni profile submissions.", icon: GraduationCap },
  { to: "/admin/community", label: "Community Moderation", description: "Handle reported posts and comments.", icon: Users },
  { to: "/admin/audit-log", label: "Audit Log", description: "Every admin action, in order.", icon: ScrollText },
] as const;

function AdminTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-4" /> Admin
        </CardTitle>
        <CardDescription>Quick links to the Admin Portal -- these are the same pages as the main nav.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {ADMIN_LINKS.map(({ to, label, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-start gap-3 rounded-lg border border-border-subtle p-3 transition-colors hover:bg-surface"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-600/10 text-accent-600 dark:text-accent-400">
              <Icon className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Shared bits
// =============================================================================

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SettingsCardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
