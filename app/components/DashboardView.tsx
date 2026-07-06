"use client";

import {
  Users, Eye, ThumbsUp, MessageSquare, TrendingUp, TrendingDown,
  PlayCircle, Camera, Music2, Heart, Minus,
} from "lucide-react";
import type { AnalysisData } from "@/app/components/AnalysisContent";
import type { ChannelSnapshot } from "@/types";

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface WeeklyGrowth {
  net: number;
  pct: number | null;
}

// Exact week-over-week subscriber growth from the Analytics API (subscribersGained −
// subscribersLost over the last 7 days), stored on the analysis. Unrounded, unlike the
// public subscriberCount. Returns null only when that Analytics data is genuinely absent
// (old analysis / fetch failed) — a real net of 0 returns { net: 0 }, not null.
function weeklyGrowth(
  gained: number | null | undefined,
  lost: number | null | undefined,
  currentSubs: number,
): WeeklyGrowth | null {
  if (gained == null || lost == null) return null;
  const net = gained - lost;
  const startCount = currentSubs - net; // subscribers at the start of the 7-day window
  const pct = startCount > 0 ? (net / startCount) * 100 : null;
  return { net, pct };
}

function signedInt(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toLocaleString()}`;
}

function GrowthPill({ growth }: { growth: WeeklyGrowth | null }) {
  if (growth === null) return <span className="text-[11px] text-zinc-600">—</span>;
  const pos = growth.net >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {signedInt(growth.net)}{growth.pct !== null ? ` (${pos ? "+" : ""}${growth.pct.toFixed(2)}%)` : ""}
    </span>
  );
}

interface ContentItem {
  platform: "youtube" | "instagram" | "tiktok";
  title: string;
  views: number;
  likes: number;
  comments: number;
  url?: string;
}

const PLATFORM_ICON: Record<ContentItem["platform"], React.ReactNode> = {
  youtube: <PlayCircle className="w-3 h-3 text-[#ff3040]" />,
  instagram: <Camera className="w-3 h-3 text-pink-400" />,
  tiktok: <Music2 className="w-3 h-3 text-cyan-400" />,
};

const PLATFORM_LABEL: Record<ContentItem["platform"], string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
};

interface Props {
  analysis: AnalysisData | null;
  snapshots: ChannelSnapshot[];
  ytConn: { channelTitle: string; channelThumbnail: string | null; channelHandle: string | null } | null;
  igConn: { username: string } | null;
  ttConn: { displayName: string } | null;
}

export function DashboardView({ analysis, ytConn, igConn, ttConn }: Props) {
  if (!ytConn && !igConn && !ttConn) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm px-6">
          <div className="w-12 h-12 bg-[#1c1c1f] border border-[#27272a] rounded-xl flex items-center justify-center mx-auto mb-4">
            <PlayCircle className="w-6 h-6 text-zinc-600" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Connect an account to get started</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Connect YouTube, Instagram, or TikTok from the sidebar to see your stats and AI insights.
          </p>
          <a
            href="/api/auth/youtube"
            className="inline-flex items-center gap-2 bg-[#ff3040] hover:bg-[#e02030] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            <PlayCircle className="w-4 h-4" />
            Connect YouTube
          </a>
        </div>
      </div>
    );
  }

  const { summary, igSummary, tikTokSummary, commentIntel } = analysis ?? {
    summary: null,
    igSummary: null,
    tikTokSummary: null,
    commentIntel: null,
  };

  // ── Totals ────────────────────────────────────────────────────────────
  const ytSubs = summary?.channel.subscriberCount ?? 0;
  const igFollowers = igSummary?.followerCount ?? 0;
  const ttFollowers = tikTokSummary?.followerCount ?? 0;
  const totalFollowers = ytSubs + igFollowers + ttFollowers;

  const ytViews = summary?.channel.totalViews ?? 0;
  const ttViews = tikTokSummary?.videos.reduce((s, v) => s + v.view_count, 0) ?? 0;
  const igReach = igSummary?.posts.reduce((s, p) => s + (p.reach ?? 0), 0) ?? 0;
  const totalViews = ytViews + ttViews + igReach;

  const ytGrowth = weeklyGrowth(analysis?.weeklySubsGained, analysis?.weeklySubsLost, ytSubs);

  const engRates: number[] = [];
  if (summary && summary.averages.views > 0)
    engRates.push((summary.averages.likes / summary.averages.views) * 100);
  if (igSummary) engRates.push(igSummary.averages.engagementRate);
  if (tikTokSummary) engRates.push(tikTokSummary.averages.engagementRate);
  const avgEngagement =
    engRates.length > 0 ? engRates.reduce((a, b) => a + b, 0) / engRates.length : null;

  // ── Cross-platform content pool ───────────────────────────────────────
  const contentPool: ContentItem[] = [];
  if (summary) {
    for (const v of [...(summary.topPerformers ?? []), ...(summary.bottomPerformers ?? [])]) {
      contentPool.push({
        platform: "youtube",
        title: v.title,
        views: v.viewCount,
        likes: v.likeCount,
        comments: v.commentCount,
        url: `https://youtube.com/watch?v=${v.id}`,
      });
    }
  }
  if (igSummary) {
    for (const p of igSummary.posts ?? []) {
      contentPool.push({
        platform: "instagram",
        title: p.caption?.slice(0, 80) || "(no caption)",
        views: p.reach ?? 0,
        likes: p.like_count,
        comments: p.comments_count,
        url: p.permalink,
      });
    }
  }
  if (tikTokSummary) {
    for (const v of tikTokSummary.videos ?? []) {
      contentPool.push({
        platform: "tiktok",
        title: v.title || v.video_description.slice(0, 80) || "(untitled)",
        views: v.view_count,
        likes: v.like_count,
        comments: v.comment_count,
        url: v.share_url,
      });
    }
  }

  const mostViewed = contentPool.length
    ? contentPool.reduce((a, b) => (b.views > a.views ? b : a))
    : null;
  const mostLiked = contentPool.length
    ? contentPool.reduce((a, b) => (b.likes > a.likes ? b : a))
    : null;
  const mostCommented = contentPool.length
    ? contentPool.reduce((a, b) => (b.comments > a.comments ? b : a))
    : null;

  // ── Top comments ──────────────────────────────────────────────────────
  const allTopComments: { text: string; videoTitle: string; platform: ContentItem["platform"] }[] = [];
  if (summary?.topPerformers) {
    for (const v of summary.topPerformers.slice(0, 5)) {
      (v.topComments ?? []).slice(0, 2).forEach((text) => {
        allTopComments.push({ text, videoTitle: v.title, platform: "youtube" });
      });
    }
  }
  if (igSummary?.topPosts) {
    for (const p of igSummary.topPosts.slice(0, 3)) {
      (p.topComments ?? []).slice(0, 1).forEach((text) => {
        allTopComments.push({ text, videoTitle: p.caption?.slice(0, 60) || "(post)", platform: "instagram" });
      });
    }
  }
  if (tikTokSummary?.topVideos) {
    for (const v of tikTokSummary.topVideos.slice(0, 3)) {
      (v.top_comments ?? []).slice(0, 1).forEach((text) => {
        allTopComments.push({ text, videoTitle: v.title || v.video_description.slice(0, 60) || "(video)", platform: "tiktok" });
      });
    }
  }
  const featuredComment = allTopComments[0] ?? null;
  const secondComment = allTopComments[1] ?? allTopComments[2] ?? null;

  const hasAnyData = analysis !== null;
  const platforms = [ytConn ? "YouTube" : null, igConn ? "Instagram" : null, ttConn ? "TikTok" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8 pb-12">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Overview</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{platforms}</p>
          </div>
          {analysis && (
            <p className="text-[11px] text-zinc-600">
              Last analysed {new Date(analysis.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>

        {!hasAnyData && (
          <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6 text-center">
            <p className="text-sm text-zinc-500">
              Click an account in the sidebar to load your analytics.
            </p>
          </div>
        )}

        {/* ── Combined Totals ──────────────────────────────────────────────── */}
        {hasAnyData && (
          <section>
            <SectionLabel>Combined Totals</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BigStatCard
                label="Total Followers"
                value={totalFollowers > 0 ? fmt(totalFollowers) : "—"}
                sub="across all platforms"
                icon={<Users className="w-4 h-4" />}
              />
              <BigStatCard
                label="Total Views"
                value={totalViews > 0 ? fmt(totalViews) : "—"}
                sub="YouTube + TikTok + IG reach"
                icon={<Eye className="w-4 h-4" />}
              />
              <BigStatCard
                label="Weekly Growth"
                value={ytGrowth !== null ? signedInt(ytGrowth.net) : "—"}
                sub={
                  ytGrowth !== null
                    ? `subscribers this week${ytGrowth.pct !== null ? ` · ${ytGrowth.net >= 0 ? "+" : ""}${ytGrowth.pct.toFixed(2)}%` : ""}`
                    : undefined
                }
                hint={ytGrowth === null ? "Populates after your next full analysis" : undefined}
                icon={
                  ytGrowth !== null && ytGrowth.net >= 0
                    ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                    : ytGrowth !== null
                    ? <TrendingDown className="w-4 h-4 text-red-500" />
                    : <Minus className="w-4 h-4 text-zinc-600" />
                }
                accent={
                  ytGrowth !== null
                    ? ytGrowth.net >= 0 ? "text-emerald-400" : "text-red-400"
                    : undefined
                }
              />
              <BigStatCard
                label="Avg Engagement"
                value={avgEngagement !== null ? `${avgEngagement.toFixed(1)}%` : "—"}
                sub="avg across connected platforms"
                icon={<ThumbsUp className="w-4 h-4" />}
              />
            </div>
          </section>
        )}

        {/* ── Per-Platform Breakdown ───────────────────────────────────────── */}
        {hasAnyData && (
          <section>
            <SectionLabel>Per-Platform Breakdown</SectionLabel>
            <div className="grid sm:grid-cols-3 gap-4">
              {ytConn && (
                <PlatformCard
                  icon={<PlayCircle className="w-4 h-4 text-[#ff3040]" />}
                  name={ytConn.channelTitle}
                  handle={ytConn.channelHandle ?? undefined}
                  color="red"
                  rows={[
                    { label: "Subscribers", value: summary ? fmt(summary.channel.subscriberCount) : "—" },
                    { label: "Total views", value: summary ? fmt(summary.channel.totalViews) : "—" },
                    {
                      label: "Weekly growth",
                      custom: <GrowthPill growth={ytGrowth} />,
                    },
                  ]}
                />
              )}
              {igConn && (
                <PlatformCard
                  icon={<Camera className="w-4 h-4 text-pink-400" />}
                  name={`@${igConn.username}`}
                  color="pink"
                  rows={[
                    { label: "Followers", value: igSummary ? fmt(igSummary.followerCount) : "—" },
                    { label: "Avg likes", value: igSummary ? fmt(igSummary.averages.likes) : "—" },
                    { label: "Avg reach", value: igSummary ? fmt(igSummary.averages.reach) : "—" },
                    { label: "Engagement rate", value: igSummary ? `${igSummary.averages.engagementRate}%` : "—" },
                  ]}
                />
              )}
              {ttConn && (
                <PlatformCard
                  icon={<Music2 className="w-4 h-4 text-cyan-400" />}
                  name={ttConn.displayName}
                  color="cyan"
                  rows={[
                    { label: "Followers", value: tikTokSummary ? fmt(tikTokSummary.followerCount) : "—" },
                    { label: "Total likes", value: tikTokSummary ? fmt(tikTokSummary.likesCount) : "—" },
                    { label: "Avg views", value: tikTokSummary ? fmt(tikTokSummary.averages.views) : "—" },
                    { label: "Engagement rate", value: tikTokSummary ? `${tikTokSummary.averages.engagementRate}%` : "—" },
                  ]}
                />
              )}
            </div>
          </section>
        )}

        {/* ── Top Performing Content ───────────────────────────────────────── */}
        {contentPool.length > 0 && (
          <section>
            <SectionLabel>Top Performing Content</SectionLabel>
            <div className="grid sm:grid-cols-3 gap-4">
              {mostViewed && (
                <TopContentCard
                  badge="Most Viewed"
                  badgeIcon={<Eye className="w-3 h-3" />}
                  item={mostViewed}
                  stat={fmt(mostViewed.views)}
                  statLabel="views"
                />
              )}
              {mostLiked && (
                <TopContentCard
                  badge="Most Liked"
                  badgeIcon={<Heart className="w-3 h-3" />}
                  item={mostLiked}
                  stat={fmt(mostLiked.likes)}
                  statLabel="likes"
                />
              )}
              {mostCommented && (
                <TopContentCard
                  badge="Most Commented"
                  badgeIcon={<MessageSquare className="w-3 h-3" />}
                  item={mostCommented}
                  stat={fmt(mostCommented.comments)}
                  statLabel="comments"
                />
              )}
            </div>
          </section>
        )}

        {/* ── Top Comments ────────────────────────────────────────────────── */}
        {(featuredComment || secondComment) && (
          <section>
            <SectionLabel>Top Comments</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-4">
              {featuredComment && (
                <CommentCard
                  label="Most liked comment"
                  text={featuredComment.text}
                  source={featuredComment.videoTitle}
                  platform={featuredComment.platform}
                />
              )}
              {secondComment && (
                <CommentCard
                  label="Most replied comment"
                  text={secondComment.text}
                  source={secondComment.videoTitle}
                  platform={secondComment.platform}
                />
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium mb-3">
      {children}
    </p>
  );
}

function BigStatCard({
  label,
  value,
  sub,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3 text-zinc-600">
        {icon}
        <p className="text-[10px] uppercase tracking-wider font-medium">{label}</p>
      </div>
      {hint ? (
        <p className="text-[12px] text-zinc-500 leading-snug">{hint}</p>
      ) : (
        <>
          <p className={`text-2xl font-bold tabular-nums ${accent ?? "text-white"}`}>{value}</p>
          {sub && <p className="text-[10px] text-zinc-600 mt-1.5 leading-relaxed">{sub}</p>}
        </>
      )}
    </div>
  );
}

function PlatformCard({
  icon,
  name,
  handle,
  color,
  rows,
}: {
  icon: React.ReactNode;
  name: string;
  handle?: string;
  color: "red" | "pink" | "cyan";
  rows: { label: string; value?: string; custom?: React.ReactNode }[];
}) {
  const borderColor = {
    red: "border-[#ff3040]/20",
    pink: "border-pink-500/20",
    cyan: "border-cyan-500/20",
  }[color];

  return (
    <div className={`bg-[#111113] border ${borderColor} rounded-xl p-5`}>
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{name}</p>
          {handle && <p className="text-[10px] text-zinc-600">{handle}</p>}
        </div>
      </div>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <p className="text-[11px] text-zinc-500">{row.label}</p>
            {row.custom ?? (
              <p className="text-[12px] font-semibold tabular-nums">{row.value ?? "—"}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopContentCard({
  badge,
  badgeIcon,
  item,
  stat,
  statLabel,
}: {
  badge: string;
  badgeIcon: React.ReactNode;
  item: ContentItem;
  stat: string;
  statLabel: string;
}) {
  const inner = (
    <div className="bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] rounded-xl p-5 transition-colors h-full flex flex-col">
      <div className="flex items-center gap-1.5 mb-3">
        {badgeIcon}
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{badge}</p>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-zinc-600">
          {PLATFORM_ICON[item.platform]}
          {PLATFORM_LABEL[item.platform]}
        </span>
      </div>
      <p className="text-sm text-zinc-200 leading-snug flex-1 line-clamp-3">{item.title}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <p className="text-xl font-bold tabular-nums text-white">{stat}</p>
        <p className="text-[11px] text-zinc-500">{statLabel}</p>
      </div>
    </div>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block h-full">
        {inner}
      </a>
    );
  }
  return <div className="h-full">{inner}</div>;
}

function CommentCard({
  label,
  text,
  source,
  platform,
}: {
  label: string;
  text: string;
  source: string;
  platform: ContentItem["platform"];
}) {
  return (
    <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-5">
      <div className="flex items-center gap-1.5 mb-3">
        <MessageSquare className="w-3 h-3 text-zinc-600" />
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className="text-sm text-zinc-200 leading-relaxed italic">
        &ldquo;{text.length > 200 ? text.slice(0, 200) + "…" : text}&rdquo;
      </p>
      <div className="flex items-center gap-1.5 mt-3">
        {PLATFORM_ICON[platform]}
        <p className="text-[10px] text-zinc-600 truncate">{source}</p>
      </div>
    </div>
  );
}
