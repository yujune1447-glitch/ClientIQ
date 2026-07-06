export interface YouTubeChannel {
  id: string;
  title: string;
  handle: string;
  thumbnail: string;
  subscriberCount: number;
  totalViews: number;
  videoCount: number;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  ctr?: number;
  averageViewDuration?: number;
  averageViewPercentage?: number;
  impressions?: number;
}

export interface VideoWithScore extends YouTubeVideo {
  performanceScore: number;
  viewsVsAverage: number;
  topComments?: string[];
  topCommentAuthors?: string[];
}

export interface TldrBullet {
  text: string;
  evidence: string;
}

export interface TitleCategoryStat {
  key: string;
  name: string;
  n: number;
  medianViews: number;
  viewMultiplier: number;
  lowConfidence: boolean;
  smallSample: boolean;
  exampleTitles: string[];
}

export interface TitleMechanicStat {
  label: string;
  withPhrase: string;
  nWith: number;
  nWithout: number;
  medianViewsWith: number;
  medianViewsWithout: number;
  multiplier: number;
  lowConfidence: boolean;
  smallSample: boolean;
}

export interface DurationBucketStat {
  label: string;
  minSec: number;
  maxSec: number;
  n: number;
  medianViews: number;
  viewMultiplier: number;
  topPerformerCount: number;
  lowConfidence: boolean;
}

export interface RetentionVideoStat {
  videoId: string;
  title: string;
  views: number;
  avgViewPct: number;
  avgViewDuration: number;
  relativeRetention: number | null;
}

export interface RetentionAnalysis {
  videosWithRetentionData: number;
  totalVideosAnalysed: number;
  channelMedianRetentionPct: number;
  topMedianRetentionPct: number;
  bottomMedianRetentionPct: number;
  relativeRetentionMedian: number | null;
  relativeRetentionN: number;
  bestRetainedVideo: RetentionVideoStat | null;
  mostViewedVideo: RetentionVideoStat | null;
  viewsRetentionDiverge: boolean;
}

export interface HookEntry {
  videoId: string;
  title: string;
  views: number;
  hookType: "cold-open-story" | "bold-claim" | "question" | "direct-address" | "other";
  hookText: string;
}

export interface HookAnalysis {
  topHooks: HookEntry[];
  bottomHooks: HookEntry[];
  captionCoverage: number;
  hasEnoughData: boolean;
}

export interface PostingTimingStat {
  lowConfidence: boolean;
  byDayOfWeek: { day: string; n: number; avgViews: number }[];
  byTimeOfDay: { slot: string; n: number; avgViews: number }[];
}

export interface VideoSubsStat {
  videoId: string;
  title: string;
  views: number;
  subsGained: number;
  subsLost: number;
  netSubs: number;
  subsPerThousandViews: number;
}

export interface TrafficSourceBreakdown {
  algorithm: number;
  search: number;
  external: number;
  notifications: number;
  other: number;
  total: number;
  algorithmPct: number;
  searchPct: number;
  externalPct: number;
  notificationsPct: number;
  otherPct: number;
}

export interface DemographicAgeBand {
  label: string;
  rawKey: string;
  viewerPct: number;
  malePct: number;
  femalePct: number;
}

export interface AudienceAnalysis {
  hasDemographicData: boolean;
  ageBands: DemographicAgeBand[];
  dominantAgeGroup: string | null;
  dominantAgeGroupPct: number | null;
  under25Pct: number | null;
  malePct: number | null;
  femalePct: number | null;
  headlineStat: string;
  personaConfirmation: string;
  hasCommentData: boolean;
  commentSentiment: { positive: number; neutral: number; negative: number } | null;
  emotionalSignals: { excited: number; grateful: number; curious: number; confused: number; critical: number; requesting: number } | null;
}

export interface GrowthAnalysis {
  videosWithSubsData: number;
  totalVideosAnalysed: number;
  thinSubsData: boolean;
  channelMedianSubsGained: number;
  topMedianSubsGained: number;
  bottomMedianSubsGained: number;
  topConverters: VideoSubsStat[];
  conversionInsight: string;
  videosWithTrafficData: number;
  thinTrafficData: boolean;
  topVideosTraffic: Array<{ videoId: string; title: string; views: number; sources: TrafficSourceBreakdown }>;
  aggregateTraffic: TrafficSourceBreakdown | null;
  trafficInsight: string;
  mostViewedVideoId: string | null;
  mostViewedTitle: string | null;
  bestRetainedVideoId: string | null;
  bestRetainedTitle: string | null;
  bestConvertingVideoId: string | null;
  bestConvertingTitle: string | null;
  trifectaDiverge: boolean;
  trifectaInsight: string;
}

export interface SuccessPatterns {
  channelMedianViews: number;
  totalVideos: number;
  tldr: TldrBullet[];
  titleCategories: TitleCategoryStat[];
  titleMechanics: TitleMechanicStat[];
  durationBuckets: DurationBucketStat[];
  postingTiming: PostingTimingStat;
  hookAnalysis?: HookAnalysis;
  retentionAnalysis?: RetentionAnalysis;
  growthAnalysis?: GrowthAnalysis;
  audienceAnalysis?: AudienceAnalysis;
}

export interface ChannelSummary {
  channel: YouTubeChannel;
  averages: {
    views: number;
    likes: number;
    comments: number;
    ctr: number;
    retentionRate: number;
  };
  topPerformers: VideoWithScore[];
  bottomPerformers: VideoWithScore[];
  outliers: VideoWithScore[];
  recentVideos?: VideoWithScore[];
  allVideos?: VideoWithScore[];
  totalVideosAnalysed: number;
  dateRange: { from: string; to: string };
  topCommenters?: { author: string; count: number }[];
  successPatterns?: SuccessPatterns;
}

export interface RawVideo {
  id: string;
  snippet: {
    title: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
  statistics: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails: {
    duration: string;
  };
}

export interface VideoAnalytics {
  averageViewDuration: number;
  averageViewPercentage: number;
  impressions: number;
  ctr: number;
}

export interface BriefHook {
  openingLine: string;
  setup: string;
  tension: string;
  payoff: string;
}

export interface BriefThumbnail {
  concept: string;
  colours: string;
  composition: string;
  textOverlay: string;
  faceExpression?: string;
}

export interface BriefDataPoint {
  claim: string;
  evidence: string;
}

export interface ContentBrief {
  weeklyIdea: string;
  titleOptions: string[];
  hook: BriefHook | string;
  recommendedLength: string;
  format: string;
  estimatedPerformance: string;
  keyTalkingPoints: string[];
  thumbnail: BriefThumbnail | string;
  thumbnailDirection?: string;
  dataEvidence: BriefDataPoint[];
  rationale?: string;
}

export interface ContentAutopsy {
  overallTrend: string;
  whatIsWorking: string[];
  whatIsNotWorking: string[];
  audienceInsights: string;
  topPerformerPattern: string;
  bottomPerformerPattern: string;
  actionableAdvice: string[];
}

export interface NicheTopVideo {
  title: string;
  views: number;
  durationSeconds: number;
  description: string;
}

export interface NicheSummary {
  niche: string;
  videosAnalysed: number;
  titlePatterns: {
    commonFormats: string[];
    powerWords: string[];
    avgTitleLength: number;
    topTitles: string[];
  };
  lengthInsights: {
    medianDurationSeconds: number;
    topPerformerRangeSeconds: [number, number];
    recommendation: string;
  };
  viewBenchmarks: {
    median: number;
    topQuartile: number;
    viral: number;
  };
  topicClusters: string[];
  hookPatterns: string[];
  topPerformers: NicheTopVideo[];
}

export interface Analysis {
  id: string;
  userId: string;
  channelId: string;
  summary: ChannelSummary;
  brief: ContentBrief;
  autopsy: ContentAutopsy;
  createdAt: string;
}

export interface InstagramPost {
  id: string;
  caption: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  timestamp: string;
  like_count: number;
  comments_count: number;
  media_url: string;
  permalink: string;
  impressions?: number;
  reach?: number;
  engagement?: number;
  saved?: number;
  video_views?: number;
  topComments?: string[];
}

export interface InstagramSummary {
  username: string;
  followerCount: number;
  mediaCount: number;
  profilePictureUrl: string;
  posts: (InstagramPost & { impressions: number; reach: number; engagement: number; saved: number })[];
  averages: {
    likes: number;
    comments: number;
    reach: number;
    engagement: number;
    engagementRate: number;
  };
  topPosts: (InstagramPost & { impressions: number; reach: number; engagement: number; saved: number })[];
  contentTypeBreakdown: { type: string; count: number; avgEngagement: number }[];
}

export interface TikTokVideo {
  id: string;
  title: string;
  video_description: string;
  duration: number;
  cover_image_url: string;
  share_url: string;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
  create_time: number;
  top_comments?: string[];
}

export interface TikTokSummary {
  displayName: string;
  followerCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
  avatarUrl: string;
  videos: TikTokVideo[];
  averages: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
  };
  topVideos: TikTokVideo[];
}

export interface CommentTheme {
  name: string;
  description: string;
  commentCount: number;
  exampleComments: string[];
  sentiment: "positive" | "mixed" | "negative";
}

export interface VideoIdeaFromComments {
  idea: string;
  sourceComment: string;
  estimatedDemand: "high" | "medium" | "low";
}

export interface AudiencePersona {
  type: string;
  description: string;
  cues: string[];
}

export interface CommentIntelligence {
  totalCommentsAnalysed: number;
  themes: CommentTheme[];
  videoIdeas: VideoIdeaFromComments[];
  emotionalSignals: {
    excited: number;
    grateful: number;
    curious: number;
    confused: number;
    critical: number;
    requesting: number;
  };
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  audiencePersonas: AudiencePersona[];
  topCommenters: { author: string; commentCount: number }[];
  keyInsight: string;
  generatedAt: string;
}

export interface ContentFormatStat {
  format: string;
  count: number;
  avgScore: number;
  avgViews: number;
}

export interface ChannelSnapshot {
  id: string;
  user_id: string;
  channel_id: string;
  analysis_id: string;
  subscriber_count: number;
  avg_ctr: number;
  avg_retention: number;
  avg_views_per_video: number;
  total_videos_analysed: number;
  top_video_id: string | null;
  top_video_title: string | null;
  top_video_views: number | null;
  top_video_score: number | null;
  top_video_published_at: string | null;
  new_videos_count: number;
  brief_followed: boolean | null;
  brief_match_video_title: string | null;
  brief_match_score: number | null;
  content_breakdown: ContentFormatStat[] | null;
  comment_sentiment: { positive: number; neutral: number; negative: number } | null;
  created_at: string;
}
