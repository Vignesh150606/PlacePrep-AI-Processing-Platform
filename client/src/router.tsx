import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  Navigate,
} from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import type { AuthContextValue } from "@/providers/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import { LoginPage } from "@/pages/login-page";
import { DashboardPage } from "@/pages/dashboard-page";

// NEW (Phase 14, Part 1 -- Performance): route-based code splitting. Every
// route below other than Login and Dashboard (the two first-paint routes
// -- pre-auth entry and the landing page for almost every session) is now
// a separate chunk, loaded on navigation instead of upfront. Confirmed via
// repo audit that all 25 pages previously loaded eagerly in one bundle.
// `AppLayout` wraps `<Outlet />` in the one `<Suspense>` boundary these
// need (see app-layout.tsx) rather than repeating one per route.
const QuestionBankPage = React.lazy(() =>
  import("@/pages/question-bank-page").then((m) => ({ default: m.QuestionBankPage })),
);
const QuizPage = React.lazy(() =>
  import("@/pages/quiz-page").then((m) => ({ default: m.QuizPage })),
);
const CompaniesPage = React.lazy(() =>
  import("@/pages/companies-page").then((m) => ({ default: m.CompaniesPage })),
);
const CompanyDetailPage = React.lazy(() =>
  import("@/pages/company-detail-page").then((m) => ({ default: m.CompanyDetailPage })),
);
const PdfLibraryPage = React.lazy(() =>
  import("@/pages/pdf-library-page").then((m) => ({ default: m.PdfLibraryPage })),
);
const PlacementCalendarPage = React.lazy(() =>
  import("@/pages/placement-calendar-page").then((m) => ({ default: m.PlacementCalendarPage })),
);
const InterviewExperiencesPage = React.lazy(() =>
  import("@/pages/interview-experiences-page").then((m) => ({
    default: m.InterviewExperiencesPage,
  })),
);
const ResourceLibraryPage = React.lazy(() =>
  import("@/pages/resource-library-page").then((m) => ({ default: m.ResourceLibraryPage })),
);
const AdminResourcesPage = React.lazy(() =>
  import("@/pages/admin-resources-page").then((m) => ({ default: m.AdminResourcesPage })),
);
const AlumniDirectoryPage = React.lazy(() =>
  import("@/pages/alumni-directory-page").then((m) => ({ default: m.AlumniDirectoryPage })),
);
const AdminAlumniPage = React.lazy(() =>
  import("@/pages/admin-alumni-page").then((m) => ({ default: m.AdminAlumniPage })),
);
const CommunityPage = React.lazy(() =>
  import("@/pages/community-page").then((m) => ({ default: m.CommunityPage })),
);
const CommunityPostDetailPage = React.lazy(() =>
  import("@/pages/community-post-detail-page").then((m) => ({
    default: m.CommunityPostDetailPage,
  })),
);
const AdminCommunityPage = React.lazy(() =>
  import("@/pages/admin-community-page").then((m) => ({ default: m.AdminCommunityPage })),
);
const SubmitQuestionPage = React.lazy(() =>
  import("@/pages/submit-question-page").then((m) => ({ default: m.SubmitQuestionPage })),
);
const AdminQuestionBuilderPage = React.lazy(() =>
  import("@/pages/admin-question-builder-page").then((m) => ({
    default: m.AdminQuestionBuilderPage,
  })),
);
const AdminBulkImportPage = React.lazy(() =>
  import("@/pages/admin-bulk-import-page").then((m) => ({ default: m.AdminBulkImportPage })),
);
const WrongAnswersPage = React.lazy(() =>
  import("@/pages/wrong-answers-page").then((m) => ({ default: m.WrongAnswersPage })),
);
const BookmarksPage = React.lazy(() =>
  import("@/pages/bookmarks-page").then((m) => ({ default: m.BookmarksPage })),
);
const AnalyticsPage = React.lazy(() =>
  import("@/pages/analytics-page").then((m) => ({ default: m.AnalyticsPage })),
);
const AdminDashboardPage = React.lazy(() =>
  import("@/pages/admin-dashboard-page").then((m) => ({ default: m.AdminDashboardPage })),
);
const AdminAuditLogPage = React.lazy(() =>
  import("@/pages/admin-audit-log-page").then((m) => ({ default: m.AdminAuditLogPage })),
);
const AdminReviewPage = React.lazy(() =>
  import("@/pages/admin-review-page").then((m) => ({ default: m.AdminReviewPage })),
);
const NotificationsPage = React.lazy(() =>
  import("@/pages/notifications-page").then((m) => ({ default: m.NotificationsPage })),
);
const ComingSoonPage = React.lazy(() =>
  import("@/pages/coming-soon").then((m) => ({ default: m.ComingSoonPage })),
);

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

// NEW (Phase 13) -- Method 2, Question Authoring System: any signed-in
// user can submit a question for admin review. Not gated at the route
// level, same "backend already scopes visibility" pattern the rest of
// this app uses -- submissions are private to their author + admins,
// enforced in questions.py's own `mine=true` filter.
const submitQuestionRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/questions/submit",
  component: SubmitQuestionPage,
});

// NEW (Phase 13) -- Method 1, Question Authoring System. Same
// not-gated-at-the-route-level pattern as every other admin-only page in
// this router (backend is require_admin-gated; nav entry hidden from
// non-admins).
const adminQuestionBuilderRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin/questions/new",
  component: AdminQuestionBuilderPage,
});

// NEW (Phase 13) -- Method 3, Question Authoring System (Smart Bulk
// Parser). Same not-gated-at-the-route-level pattern as
// adminQuestionBuilderRoute above.
const adminBulkImportRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin/questions/bulk-import",
  component: AdminBulkImportPage,
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
    submitQuestionRoute,
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
    adminQuestionBuilderRoute,
    adminBulkImportRoute,
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
