import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  Navigate,
} from "@tanstack/react-router";
import { z } from "zod";
import type { AuthContextValue } from "@/providers/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import { LoginPage } from "@/pages/login-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { QuestionBankPage } from "@/pages/question-bank-page";
import { QuizPage } from "@/pages/quiz-page";
import { CompaniesPage } from "@/pages/companies-page";
import { CompanyDetailPage } from "@/pages/company-detail-page";
import { PdfLibraryPage } from "@/pages/pdf-library-page";
import { PlacementCalendarPage } from "@/pages/placement-calendar-page";
import { InterviewExperiencesPage } from "@/pages/interview-experiences-page";
import { ResourceLibraryPage } from "@/pages/resource-library-page";
import { AdminResourcesPage } from "@/pages/admin-resources-page";
import { AlumniDirectoryPage } from "@/pages/alumni-directory-page";
import { AdminAlumniPage } from "@/pages/admin-alumni-page";
import { CommunityPage } from "@/pages/community-page";
import { CommunityPostDetailPage } from "@/pages/community-post-detail-page";
import { AdminCommunityPage } from "@/pages/admin-community-page";
import { WrongAnswersPage } from "@/pages/wrong-answers-page";
import { BookmarksPage } from "@/pages/bookmarks-page";
import { AnalyticsPage } from "@/pages/analytics-page";
import { AdminDashboardPage } from "@/pages/admin-dashboard-page";
import { AdminAuditLogPage } from "@/pages/admin-audit-log-page";
import { AdminReviewPage } from "@/pages/admin-review-page";
import { NotificationsPage } from "@/pages/notifications-page";
import { ComingSoonPage } from "@/pages/coming-soon";

export interface RouterContext {
  auth: AuthContextValue;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  beforeLoad: ({ context }) => {
    if (context.auth.session) {
      throw redirect({ to: "/" });
    }
  },
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app-layout",
  component: AppLayout,
  beforeLoad: ({ context }) => {
    if (!context.auth.session) {
      throw redirect({ to: "/login" });
    }
  },
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  component: DashboardPage,
});

const questionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/questions",
  component: QuestionBankPage,
});

// MODIFIED (Sprint 1A): now validates an optional `mode` search param so
// Bookmarks' "Practice bookmarks" and Wrong Answers' "Retry all" can land
// directly in the right quiz mode instead of the generic form defaulting
// to "mixed" (see quiz-config-form.tsx's `defaultMode` prop).
const quizSearchSchema = z.object({
  mode: z.enum(["topic", "company", "mixed", "random", "wrong-answers", "bookmarks"]).optional(),
});

export const quizRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/quiz",
  component: QuizPage,
  validateSearch: quizSearchSchema,
});

const companiesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/companies",
  component: CompaniesPage,
});

const companyDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/companies/$slug",
  component: CompanyDetailPage,
});

const pdfsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/pdfs",
  component: PdfLibraryPage,
});

// MODIFIED (Phase 9): was a ComingSoonPage stub — now the real Interview
// Experience Repository.
const experiencesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/experiences",
  component: InterviewExperiencesPage,
});

// NEW (Phase 10): the Resource Intelligence Hub. Not gated at the route
// level -- the backend already scopes visibility (non-admins only ever
// see approved resources plus their own), same pattern as every other
// moderated-content route in this app.
const resourcesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/resources",
  component: ResourceLibraryPage,
});

// MODIFIED (Phase 12): was a ComingSoonPage stub -- now the real
// Placement Community. Not gated at the route level, same "backend
// already scopes visibility" pattern resourcesRoute/alumniRoute use
// (posts are visible to every signed-in user; community.py enforces
// author/admin-only writes).
const communityRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/community",
  component: CommunityPage,
});

const communityPostDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/community/$postId",
  component: CommunityPostDetailPage,
});

// NEW (Phase 11): the Alumni Intelligence Network. A structured directory,
// deliberately separate from `communityRoute` above -- per the brief,
// Community/Messaging/full Mentorship stay out of scope this pass. Not
// gated at the route level, same "backend already scopes visibility"
// pattern `resourcesRoute` uses above.
const alumniRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/alumni",
  component: AlumniDirectoryPage,
});

// MODIFIED (Phase 8): was a ComingSoonPage stub — now the real Placement Calendar.
const calendarRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/calendar",
  component: PlacementCalendarPage,
});

// MODIFIED (Module 5): was a ComingSoonPage stub — now the real Bookmarks page.
const bookmarksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/bookmarks",
  component: BookmarksPage,
});

// MODIFIED (Module 4): was a ComingSoonPage stub — now the real Wrong Answer Notebook.
const wrongAnswersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/wrong-answers",
  component: WrongAnswersPage,
});

// NEW (Module 7).
const analyticsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/analytics",
  component: AnalyticsPage,
});

// NEW (Admin Portal Expansion, Module 1). Same "not gated at the route
// level" pattern as adminReviewRoute below -- backend endpoints are
// require_admin-gated and the nav entry is hidden from non-admins.
const adminDashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin",
  component: AdminDashboardPage,
});

// NEW (Module 8). Not admin-gated at the route level on purpose — the backend
// endpoints it calls are admin-gated (require_admin), and the nav entry is
// already hidden from non-admins (see nav-items.ts) — a non-admin hitting
// this URL directly just gets empty/failed API calls, same pattern the rest
// of this app uses (e.g. the Processing Dashboard tab).
const adminReviewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin/review",
  component: AdminReviewPage,
});

// NEW (Admin Portal Expansion, Module 2). Same not-gated-at-the-route-level
// pattern as adminDashboardRoute/adminReviewRoute above.
const adminAuditLogRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin/audit-log",
  component: AdminAuditLogPage,
});

// NEW (Phase 10). Same not-gated-at-the-route-level pattern as
// adminReviewRoute/adminAuditLogRoute above -- "Pending Resources" lives
// at its own path (mirrors how Question Bank moderation gets its own
// /admin/review instead of living inside the dashboard), still part of
// the Admin Portal, not a separate admin system.
const adminResourcesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin/resources",
  component: AdminResourcesPage,
});

// NEW (Phase 11). Same not-gated-at-the-route-level pattern as
// adminResourcesRoute above -- "Pending Alumni Verification" gets its own
// path, still part of the existing Admin Portal.
const adminAlumniRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin/alumni",
  component: AdminAlumniPage,
});

// NEW (Phase 12). Same not-gated-at-the-route-level pattern as
// adminResourcesRoute/adminAlumniRoute above -- "Community Moderation"
// gets its own path, still part of the existing Admin Portal.
const adminCommunityRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin/community",
  component: AdminCommunityPage,
});
const notificationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/notifications",
  component: NotificationsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: () => <ComingSoonPage title="Settings" />,
});

const notFoundRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "*",
  component: () => <Navigate to="/" />,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appLayoutRoute.addChildren([
    indexRoute,
    questionsRoute,
    quizRoute,
    companiesRoute,
    companyDetailRoute,
    pdfsRoute,
    experiencesRoute,
    resourcesRoute,
    alumniRoute,
    communityRoute,
    communityPostDetailRoute,
    calendarRoute,
    bookmarksRoute,
    wrongAnswersRoute,
    analyticsRoute,
    adminDashboardRoute,
    adminReviewRoute,
    adminAuditLogRoute,
    adminResourcesRoute,
    adminAlumniRoute,
    adminCommunityRoute,
    notificationsRoute,
    settingsRoute,
    notFoundRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  context: { auth: undefined! },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
