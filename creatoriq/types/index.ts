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
  totalVideosAnalysed: number;
  dateRange: { from: string; to: string };
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

export interface ContentBrief {
  weeklyIdea: string;
  rationale: string;
  hook: string;
  format: string;
  estimatedPerformance: string;
  keyTalkingPoints: string[];
  thumbnailDirection: string;
  titleOptions: string[];
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
  created_at: string;
}
