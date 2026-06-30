"use client";

import {
  TrendingUp, TrendingDown, PlayCircle, Eye, ThumbsUp,
  MessageSquare, Lightbulb, Target, BarChart2, Bell, Camera, Heart, Music2, Share2,
  Clock, Database,
} from "lucide-react";
import { MarkRead } from "@/app/components/MarkRead";
import { GrowthSection } from "@/app/components/GrowthSection";
import { CommentIntelligenceSection } from "@/app/components/CommentIntelligenceSection";
import type {
  ChannelSummary, ContentBrief, ContentAutopsy, VideoWithScore,
  ChannelSnapshot, InstagramSummary, TikTokSummary, CommentIntelligence,
  BriefHook, BriefThumbnail,
} from "@/types";

export interface AnalysisData {
  id: string;
  createdAt: string;
  summary: ChannelSummary;
  brief: ContentBrief | null;
  autopsy: ContentAutopsy | null;
  igSummary: InstagramSummary | null;
  tikTokSummary: TikTokSummary | null;
  commentIntel: CommentIntelligence | null;
  isUnread: boolean;
  isScheduled: boolean;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function AnalysisContent({
  analysis,
  snapshots,
  platformFilter,
}: {
  analysis: AnalysisData;
  snapshots: ChannelSnapshot[];
  platformFilter?: "youtube" | "instagram" | "tiktok";
}) {
  const { summary, brief, autopsy, igSummary, tikTokSummary, commentIntel, isUnread, isScheduled, id, createdAt } = analysis;
  const { channel, averages, topPerformers, bottomPerformers } = summary;

  const showIG = !platformFilter || platformFilter === "instagram";
  const showTT = !platformFilter || platformFilter === "tiktok";

  if (platformFilter === "instagram") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold">Instagram Analytics</h1>
          {igSummary && <p className="text-sm text-zinc-500 mt-0.5">@{igSummary.username}</p>}
        </div>
        {igSummary ? (
          <>
            <div className="grid sm:grid-cols-4 gap-3">
              {[
                { label: "Followers", value: fmt(igSummary.followerCount) },
                { label: "Avg likes", value: fmt(igSummary.averages.likes) },
                { label: "Avg reach", value: fmt(igSummary.averages.reach) },
                { label: "Engagement rate", value: `${igSummary.averages.engagementRate}%` },
              ].map((s) => (
                <div key={s.label} className="bg-[#111113] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-zinc-600 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-4">Top posts by engagement</p>
              <div className="space-y-2">
                {igSummary.topPosts.slice(0, 10).map((post, i) => (
                  <a
                    key={post.id}
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:bg-[#1a1a1d] rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <span className="text-xs font-mono text-zinc-600 w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                        {post.caption?.slice(0, 80) || "(no caption)"}
                      </p>
                      <p className="text-[11px] text-zinc-600">{post.media_type} · {post.timestamp.slice(0, 10)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(post.like_count)}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.comments_count}</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(post.reach)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </>
        ) : (
          <a
            href="/api/auth/instagram"
            className="flex items-center gap-4 bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] rounded-xl p-5 transition-colors group"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">Connect Instagram</p>
              <p className="text-xs text-zinc-700">Add cross-platform audience signals to your next brief</p>
            </div>
          </a>
        )}
        <div className="pb-4" />
      </div>
    );
  }

  if (platformFilter === "tiktok") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold">TikTok Analytics</h1>
          {tikTokSummary && <p className="text-sm text-zinc-500 mt-0.5">{tikTokSummary.displayName}</p>}
        </div>
        {tikTokSummary ? (
          <>
            <div className="grid sm:grid-cols-4 gap-3">
              {[
                { label: "Followers", value: fmt(tikTokSummary.followerCount) },
                { label: "Avg views", value: fmt(tikTokSummary.averages.views) },
                { label: "Avg likes", value: fmt(tikTokSummary.averages.likes) },
                { label: "Engagement rate", value: `${tikTokSummary.averages.engagementRate}%` },
              ].map((s) => (
                <div key={s.label} className="bg-[#111113] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-zinc-600 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-4">Top videos by views</p>
              <div className="space-y-2">
                {tikTokSummary.topVideos.slice(0, 10).map((video, i) => (
                  <a
                    key={video.id}
                    href={video.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:bg-[#1a1a1d] rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <span className="text-xs font-mono text-zinc-600 w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                        {video.title || video.video_description.slice(0, 80) || "(untitled)"}
                      </p>
                      <p className="text-[11px] text-zinc-600">
                        {video.duration}s · {new Date(video.create_time * 1000).toISOString().slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(video.view_count)}</span>
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(video.like_count)}</span>
                      <span className="flex items-center gap-1"><Share2 className="w-3 h-3" />{fmt(video.share_count)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </>
        ) : (
          <a
            href="/api/auth/tiktok"
            className="flex items-center gap-4 bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] rounded-xl p-5 transition-colors group"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-[#EE1D52] flex items-center justify-center shrink-0">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">Connect TikTok</p>
              <p className="text-xs text-zinc-700">Add short-form video signals to your next brief</p>
            </div>
          </a>
        )}
        <div className="pb-4" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {isUnread && <MarkRead analysisId={id} />}

      {isUnread && isScheduled && (
        <div className="bg-[#1a1014] border-b border-[#ff3040]/30 px-6 py-2.5 flex items-center justify-center gap-2">
          <Bell className="w-3.5 h-3.5 text-[#ff3040]" />
          <p className="text-xs text-zinc-300">
            Your weekly brief was automatically generated. New intelligence every Monday.
          </p>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Channel header */}
        <div className="flex items-center gap-4">
          {channel.thumbnail ? (
            <img src={channel.thumbnail} alt={channel.title} className="w-11 h-11 rounded-full object-cover" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[#ff3040] flex items-center justify-center shrink-0">
              <PlayCircle className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold">{channel.title}</h1>
            <p className="text-xs text-zinc-500">
              {fmt(summary.totalVideosAnalysed)} videos analysed · {new Date(createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="ml-auto flex gap-6">
            {[
              { label: "Subscribers", value: fmt(channel.subscriberCount) },
              { label: "Avg views", value: fmt(averages.views) },
              { label: "Avg CTR", value: `${averages.ctr}%` },
            ].map((s) => (
              <div key={s.label} className="text-right hidden sm:block">
                <p className="text-base font-bold tabular-nums">{s.value}</p>
                <p className="text-[11px] text-zinc-600">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Content Brief */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-[#ff3040]" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              This Week&apos;s Content Brief
            </h2>
          </div>
          {brief ? (
            <BriefCard brief={brief} />
          ) : (
            <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6 text-sm text-zinc-500">
              Brief not available for this analysis.
            </div>
          )}
        </section>

        {/* Channel Autopsy */}
        {autopsy && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-[#ff3040]" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Channel Autopsy</h2>
            </div>

            <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6 mb-4">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Overall diagnosis</p>
              <p className="text-sm text-zinc-200 leading-relaxed">{autopsy.overallTrend}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div className="bg-[#0f1a14] border border-emerald-900/40 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">What&apos;s working</p>
                </div>
                <ul className="space-y-2">
                  {autopsy.whatIsWorking.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-emerald-600 shrink-0 mt-0.5">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-[#1a0f0f] border border-red-900/40 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">What isn&apos;t working</p>
                </div>
                <ul className="space-y-2">
                  {autopsy.whatIsNotWorking.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-red-600 shrink-0 mt-0.5">✗</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-5">
                <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Audience insight</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{autopsy.audienceInsights}</p>
              </div>
              <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-3.5 h-3.5 text-[#ff3040]" />
                  <p className="text-xs text-zinc-600 uppercase tracking-wider">Actions to take now</p>
                </div>
                <ul className="space-y-2">
                  {autopsy.actionableAdvice.map((advice, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-[#ff3040] shrink-0 mt-0.5 text-xs font-mono">{i + 1}.</span>
                      {advice}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Video performance */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-[#ff3040]" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Video Performance</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <VideoList label="Top performers" videos={topPerformers} variant="top" />
            <VideoList label="Bottom performers" videos={bottomPerformers} variant="bottom" />
          </div>
        </section>

        {/* Comment intelligence */}
        {commentIntel && commentIntel.themes.length > 0 && (
          <CommentIntelligenceSection intel={commentIntel} />
        )}

        {/* Growth tracking */}
        <GrowthSection snapshots={snapshots} />

        {/* Instagram */}
        {showIG && igSummary ? (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Camera className="w-4 h-4 text-[#ff3040]" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Instagram Intelligence</h2>
              <span className="text-xs text-zinc-600 ml-1">@{igSummary.username}</span>
            </div>
            <div className="grid sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Followers", value: fmt(igSummary.followerCount) },
                { label: "Avg likes", value: fmt(igSummary.averages.likes) },
                { label: "Avg reach", value: fmt(igSummary.averages.reach) },
                { label: "Engagement rate", value: `${igSummary.averages.engagementRate}%` },
              ].map((s) => (
                <div key={s.label} className="bg-[#111113] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-zinc-600 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-4">Top posts by engagement</p>
              <div className="space-y-2">
                {igSummary.topPosts.slice(0, 5).map((post, i) => (
                  <a
                    key={post.id}
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:bg-[#1a1a1d] rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <span className="text-xs font-mono text-zinc-600 w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                        {post.caption?.slice(0, 80) || "(no caption)"}
                      </p>
                      <p className="text-[11px] text-zinc-600">{post.media_type} · {post.timestamp.slice(0, 10)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(post.like_count)}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.comments_count}</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(post.reach)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        ) : showIG ? (
          <section>
            <a
              href="/api/auth/instagram"
              className="flex items-center gap-4 bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] rounded-xl p-5 transition-colors group"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">Connect Instagram</p>
                <p className="text-xs text-zinc-700">Add cross-platform audience signals to your next brief</p>
              </div>
            </a>
          </section>
        ) : null}

        {/* TikTok */}
        {showTT && tikTokSummary ? (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Music2 className="w-4 h-4 text-[#ff3040]" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">TikTok Intelligence</h2>
              <span className="text-xs text-zinc-600 ml-1">{tikTokSummary.displayName}</span>
            </div>
            <div className="grid sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Followers", value: fmt(tikTokSummary.followerCount) },
                { label: "Avg views", value: fmt(tikTokSummary.averages.views) },
                { label: "Avg likes", value: fmt(tikTokSummary.averages.likes) },
                { label: "Engagement rate", value: `${tikTokSummary.averages.engagementRate}%` },
              ].map((s) => (
                <div key={s.label} className="bg-[#111113] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-zinc-600 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-4">Top videos by views</p>
              <div className="space-y-2">
                {tikTokSummary.topVideos.slice(0, 5).map((video, i) => (
                  <a
                    key={video.id}
                    href={video.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:bg-[#1a1a1d] rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <span className="text-xs font-mono text-zinc-600 w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                        {video.title || video.video_description.slice(0, 80) || "(untitled)"}
                      </p>
                      <p className="text-[11px] text-zinc-600">
                        {video.duration}s · {new Date(video.create_time * 1000).toISOString().slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(video.view_count)}</span>
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(video.like_count)}</span>
                      <span className="flex items-center gap-1"><Share2 className="w-3 h-3" />{fmt(video.share_count)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        ) : showTT ? (
          <section>
            <a
              href="/api/auth/tiktok"
              className="flex items-center gap-4 bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] rounded-xl p-5 transition-colors group"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-[#EE1D52] flex items-center justify-center shrink-0">
                <Music2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">Connect TikTok</p>
                <p className="text-xs text-zinc-700">Add short-form video signals to your next brief</p>
              </div>
            </a>
          </section>
        ) : null}

        {/* Footer stats */}
        <div className="border-t border-[#1f1f22] pt-6 flex flex-wrap gap-6 pb-10">
          {[
            { icon: <Eye className="w-3.5 h-3.5" />, label: "Avg views", value: fmt(averages.views) },
            { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: "Avg likes", value: fmt(averages.likes) },
            { icon: <MessageSquare className="w-3.5 h-3.5" />, label: "Avg comments", value: fmt(averages.comments) },
            { icon: <BarChart2 className="w-3.5 h-3.5" />, label: "Videos analysed", value: fmt(summary.totalVideosAnalysed) },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-zinc-500">
              {s.icon}
              <span className="text-xs">{s.label}:</span>
              <span className="text-xs font-semibold text-zinc-300">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BriefCard({ brief }: { brief: ContentBrief }) {
  const hook = brief.hook;
  const hookIsObject = hook && typeof hook === "object";
  const thumbnail = brief.thumbnail ?? brief.thumbnailDirection;
  const thumbIsObject = thumbnail && typeof thumbnail === "object";

  return (
    <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6 space-y-6">
      <div>
        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Make this video</p>
        <h3 className="text-xl font-bold tracking-tight leading-tight">&ldquo;{brief.weeklyIdea}&rdquo;</h3>
      </div>

      <div>
        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">3 title variations</p>
        <div className="space-y-2">
          {brief.titleOptions.map((title, i) => (
            <div
              key={i}
              className={`px-4 py-2.5 rounded-lg border text-sm ${
                i === 0
                  ? "border-[#ff3040]/40 bg-[#1a1014] text-white font-medium"
                  : "border-[#1f1f22] text-zinc-400"
              }`}
            >
              {i === 0 && <span className="text-[10px] text-[#ff3040] font-semibold mr-2 uppercase">Recommended</span>}
              {title}
            </div>
          ))}
        </div>
      </div>

      <div className="h-px bg-[#1f1f22]" />

      <div>
        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Opening 30 seconds</p>
        {hookIsObject ? (
          <div className="space-y-3">
            <div className="bg-[#1a1014] border border-[#ff3040]/20 rounded-lg p-4">
              <p className="text-[10px] text-[#ff3040] uppercase tracking-wider mb-1.5 font-semibold">Opening line</p>
              <p className="text-sm text-zinc-200 italic leading-relaxed">&ldquo;{(hook as BriefHook).openingLine}&rdquo;</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              {[
                { label: "0–10s  Setup", body: (hook as BriefHook).setup, accent: "text-zinc-500" },
                { label: "10–20s  Tension", body: (hook as BriefHook).tension, accent: "text-amber-600" },
                { label: "20–30s  Payoff", body: (hook as BriefHook).payoff, accent: "text-emerald-600" },
              ].map(({ label, body, accent }) => (
                <div key={label} className="bg-[#0f1114] border border-[#1f1f22] rounded-lg p-3">
                  <p className={`text-[10px] uppercase tracking-wider mb-1.5 font-semibold ${accent}`}>{label}</p>
                  <p className="text-xs text-zinc-400 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[#1a1014] border border-[#ff3040]/20 rounded-lg p-4">
            <p className="text-sm text-zinc-200 italic leading-relaxed">{String(hook)}</p>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {brief.recommendedLength && (
          <div className="bg-[#0f1114] border border-[#1f1f22] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-zinc-600" />
              <p className="text-xs text-zinc-600 uppercase tracking-wider">Recommended length</p>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{brief.recommendedLength}</p>
          </div>
        )}
        <div className="bg-[#0f1114] border border-[#1f1f22] rounded-lg p-4">
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Format &amp; production</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{brief.format}</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Key talking points</p>
        <ul className="space-y-2">
          {brief.keyTalkingPoints.map((point, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
              <span className="text-[#ff3040] font-mono text-xs mt-0.5 shrink-0">{i + 1}.</span>
              {point}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Thumbnail direction</p>
        {thumbIsObject ? (
          <div className="space-y-2">
            <div className="bg-[#0f1114] border border-[#1f1f22] rounded-lg p-4 mb-3">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-1.5">Concept</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{(thumbnail as BriefThumbnail).concept}</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              {[
                { label: "Colours", body: (thumbnail as BriefThumbnail).colours },
                { label: "Composition", body: (thumbnail as BriefThumbnail).composition },
                { label: "Text overlay", body: (thumbnail as BriefThumbnail).textOverlay },
              ].map(({ label, body }) => (
                <div key={label} className="bg-[#0f1114] border border-[#1f1f22] rounded-lg p-3">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">{label}</p>
                  <p className="text-xs text-zinc-400 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
            {(thumbnail as BriefThumbnail).faceExpression && (
              <div className="bg-[#0f1114] border border-[#1f1f22] rounded-lg p-3">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Face &amp; expression</p>
                <p className="text-xs text-zinc-400 leading-relaxed">{(thumbnail as BriefThumbnail).faceExpression}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#0f1114] border border-[#1f1f22] rounded-lg p-4">
            <p className="text-sm text-zinc-300 leading-relaxed">{String(thumbnail)}</p>
          </div>
        )}
      </div>

      {brief.dataEvidence && brief.dataEvidence.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-3.5 h-3.5 text-zinc-600" />
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Why this will work — the data</p>
          </div>
          <div className="space-y-2">
            {brief.dataEvidence.map((point, i) => (
              <div key={i} className="flex gap-3 bg-[#0f1114] border border-[#1f1f22] rounded-lg p-3">
                <div className="shrink-0 mt-0.5">
                  <div className="w-5 h-5 rounded-full bg-[#1f1f22] flex items-center justify-center">
                    <span className="text-[9px] font-bold text-zinc-500">{i + 1}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-300 mb-1">{point.claim}</p>
                  <p className="text-xs text-zinc-600 leading-relaxed">{point.evidence}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {brief.rationale && (!brief.dataEvidence || brief.dataEvidence.length === 0) && (
        <div>
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Why this works</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{brief.rationale}</p>
        </div>
      )}
    </div>
  );
}

function VideoList({
  label,
  videos,
  variant,
}: {
  label: string;
  videos: VideoWithScore[];
  variant: "top" | "bottom";
}) {
  const isTop = variant === "top";
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {isTop ? (
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5 text-red-500" />
        )}
        <p className={`text-xs font-semibold ${isTop ? "text-emerald-500" : "text-red-500"}`}>{label}</p>
      </div>
      <div className="space-y-2">
        {videos.map((v, i) => (
          <div key={v.id} className="flex items-center gap-3 bg-[#111113] border border-[#1f1f22] rounded-lg px-4 py-3">
            <span className="text-xs font-mono text-zinc-600 w-5 shrink-0">#{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{v.title}</p>
              <p className="text-xs text-zinc-600">{v.publishedAt.slice(0, 10)}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-sm font-bold text-white">
                <Eye className="w-3 h-3 text-zinc-600" />
                {fmt(v.viewCount)}
              </div>
              <p className={`text-[11px] ${isTop ? "text-emerald-500" : "text-red-500"}`}>
                Score {v.performanceScore}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
