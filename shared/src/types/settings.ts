export interface NotificationPrefs {
  contentUpdates: boolean;
  communityActivity: boolean;
}

export interface Settings {
  notificationPrefs: NotificationPrefs;
  defaultAnonymousInterview: boolean;
  /** null for students -- only alumni have a directory listing to opt out of. */
  alumniDirectoryVisible: boolean | null;
}

export type SettingsUpdateInput = Partial<{
  notificationPrefs: NotificationPrefs;
  defaultAnonymousInterview: boolean;
  alumniDirectoryVisible: boolean;
}>;

export interface DataExport {
  exportedAt: string;
  profile: Record<string, unknown>;
  quizAttempts: Record<string, unknown>[];
  bookmarks: Record<string, unknown>[];
  wrongAnswerMarks: Record<string, unknown>[];
  submittedQuestions: Record<string, unknown>[];
  submittedResources: Record<string, unknown>[];
  submittedInterviewExperiences: Record<string, unknown>[];
  communityPosts: Record<string, unknown>[];
  communityComments: Record<string, unknown>[];
}
