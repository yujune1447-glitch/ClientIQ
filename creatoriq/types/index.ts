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

export interface Analysis {
  id: string;
  userId: string;
  channelId: string;
  summary: ChannelSummary;
  brief: ContentBrief;
  autopsy: ContentAutopsy;
  createdAt: string;
}
