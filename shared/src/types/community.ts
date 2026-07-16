import type { ISODateString, UUID } from "./common";

export type CommunityCategory =
  | "general-placement"
  | "aptitude"
  | "dsa"
  | "core-subjects"
  | "hr-interview"
  | "technical-interview"
  | "company-specific"
  | "off-campus"
  | "higher-studies"
  | "resume-review"
  | "mock-interview"
  | "resources";

export const COMMUNITY_CATEGORIES: { value: CommunityCategory; label: string }[] = [
  { value: "general-placement", label: "General Placement" },
  { value: "aptitude", label: "Aptitude" },
  { value: "dsa", label: "DSA" },
  { value: "core-subjects", label: "Core Subjects" },
  { value: "hr-interview", label: "HR Interview" },
  { value: "technical-interview", label: "Technical Interview" },
  { value: "company-specific", label: "Company Specific" },
  { value: "off-campus", label: "Off Campus" },
  { value: "higher-studies", label: "Higher Studies" },
  { value: "resume-review", label: "Resume Review" },
  { value: "mock-interview", label: "Mock Interview" },
  { value: "resources", label: "Resources" },
];

export type CommunitySortOption = "newest" | "most-helpful" | "most-viewed" | "unanswered";

export const COMMUNITY_SORT_OPTIONS: { value: CommunitySortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "most-helpful", label: "Most Helpful" },
  { value: "most-viewed", label: "Most Viewed" },
  { value: "unanswered", label: "Unanswered" },
];

export type CommunityVoteType = "helpful" | "not-helpful";

export interface CommunityAttachment {
  fileName: string;
  fileSizeBytes: number;
  fileKind: "pdf" | "image";
}

export interface CommunityPost {
  id: UUID;
  /** Null when `isAnonymous` and the requester isn't the author or an
   * admin -- same redaction shape as `InterviewExperience.authorId`. */
  authorId: UUID | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  isAnonymous: boolean;
  isAuthorVerifiedAlumni: boolean;
  authorMentorshipAvailable: boolean;
  category: CommunityCategory;
  title: string;
  description: string;
  companyId: UUID | null;
  companyName: string | null;
  tags: string[];
  attachments: CommunityAttachment[];
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  replyCount: number;
  myVote: CommunityVoteType | null;
  isPinned: boolean;
  isLocked: boolean;
  /** Admin-only -- null for everyone else, same reasoning as
   * `InterviewExperience.reportCount`. */
  reportCount: number | null;
  createdAt: ISODateString;
  updatedAt: ISODateString | null;
}

export interface CommunityPostListResult {
  items: CommunityPost[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CommunityComment {
  id: UUID;
  postId: UUID;
  parentCommentId: UUID | null;
  authorId: UUID | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  isAnonymous: boolean;
  isAuthorVerifiedAlumni: boolean;
  content: string;
  helpfulCount: number;
  myVote: CommunityVoteType | null;
  reportCount: number | null;
  editedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString | null;
}

export interface ReportedCommunityPost {
  post: CommunityPost;
  reportCount: number;
  reasons: string[];
}

export interface ReportedCommunityComment {
  comment: CommunityComment;
  postId: UUID;
  reportCount: number;
  reasons: string[];
}

export interface CommunityMostDiscussedCompany {
  companyId: UUID;
  companyName: string;
  postCount: number;
}

export interface CommunityTrendingTag {
  tag: string;
  count: number;
}

export interface CommunityTopContributor {
  profileId: UUID;
  fullName: string | null;
  avatarUrl: string | null;
  helpfulVotes: number;
  isVerifiedAlumni: boolean;
}

export interface CommunityAnalytics {
  totalPosts: number;
  totalComments: number;
  activeUsersLast30Days: number;
  mostDiscussedCompanies: CommunityMostDiscussedCompany[];
  trendingTags: CommunityTrendingTag[];
  mostHelpfulContributors: CommunityTopContributor[];
}
