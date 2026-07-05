import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  Navigate,
} from "@tanstack/react-router";
import type { AuthContextValue } from "@/providers/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import { LoginPage } from "@/pages/login-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { QuestionBankPage } from "@/pages/question-bank-page";
import { QuizPage } from "@/pages/quiz-page";
import { CompaniesPage } from "@/pages/companies-page";
import { CompanyDetailPage } from "@/pages/company-detail-page";
import { PdfLibraryPage } from "@/pages/pdf-library-page";
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

const quizRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/quiz",
  component: QuizPage,
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

const experiencesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/experiences",
  component: () => <ComingSoonPage title="Interview Experiences" />,
});

const communityRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/community",
  component: () => <ComingSoonPage title="Community" />,
});

const calendarRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/calendar",
  component: () => <ComingSoonPage title="Placement Calendar" />,
});

const bookmarksRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/bookmarks",
  component: () => <ComingSoonPage title="Bookmarks" />,
});

const wrongAnswersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/wrong-answers",
  component: () => <ComingSoonPage title="Wrong Answers" />,
});

const notificationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/notifications",
  component: () => <ComingSoonPage title="Notifications" />,
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
    communityRoute,
    calendarRoute,
    bookmarksRoute,
    wrongAnswersRoute,
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
