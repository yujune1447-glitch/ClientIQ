export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-10 block">
          ← Back to Aion
        </a>

        <h1 className="text-2xl font-semibold mb-1">Privacy Policy</h1>
        <p className="text-xs text-zinc-500 mb-10">Last updated: 11 July 2026</p>

        <div className="space-y-8 text-sm text-zinc-400 leading-relaxed">
          <section>
            <h2 className="text-base font-medium text-white mb-2">Introduction</h2>
            <p>
              Aion is a content intelligence tool for creators. This policy explains what data Aion
              accesses when you connect your YouTube account, why we access it, how we store it, and
              how you can revoke access or delete your data. For any privacy question or request,
              contact us at{" "}
              <a href="mailto:privacy@aion.app" className="text-zinc-300 hover:text-white underline transition-colors">
                privacy@aion.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">YouTube API Services</h2>
            <p>
              Aion uses YouTube API Services. By connecting your YouTube account and using Aion, you
              are also agreeing to the{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 hover:text-white underline transition-colors"
              >
                YouTube Terms of Service
              </a>
              . Information Aion receives from YouTube API Services is handled in accordance with the{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 hover:text-white underline transition-colors"
              >
                Google Privacy Policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">What Google/YouTube data we access and why</h2>
            <p>
              When you connect your YouTube account, Aion requests read-only access using the{" "}
              <code className="text-zinc-300">youtube.readonly</code> and{" "}
              <code className="text-zinc-300">yt-analytics.readonly</code> scopes. With those scopes we
              access:
            </p>
            <ul className="mt-3 space-y-1.5 list-disc list-inside text-zinc-500">
              <li>YouTube channel metadata — channel title, ID, thumbnail, subscriber count, video count, and per-video metadata (titles, publish dates, view/like/comment counts)</li>
              <li>YouTube Analytics — performance metrics for your own channel such as views, watch time, audience retention, click-through rate, traffic sources, and subscriber changes</li>
              <li>Your Google account email address — used only to identify your Aion account</li>
            </ul>
            <p className="mt-3">
              We access this data <span className="text-zinc-300">solely to generate your own content
              recommendations and weekly brief</span> inside Aion. We do not access data for any channel
              you do not own, and we request read-only access only — Aion never modifies, uploads, or
              deletes anything on your YouTube account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">How your data is stored and processed</h2>
            <p>
              Your data is stored in Supabase (a hosted PostgreSQL database) on infrastructure located
              in the United States. Google OAuth tokens are stored so Aion can refresh your channel data
              on your behalf, and are used only for that purpose.
            </p>
            <p className="mt-3">
              To generate your recommendations, a compressed summary of your channel data is sent to our
              third-party AI provider, Anthropic (the Claude API), strictly to produce that
              recommendation for you. We do <span className="text-zinc-300">not</span> sell your data, we
              do <span className="text-zinc-300">not</span> use it for advertising, and neither Aion nor
              Anthropic uses your Google/YouTube data to train AI or machine-learning models.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">Limited Use disclosure</h2>
            <p>
              Aion&apos;s use and transfer of information received from Google APIs to any other app will
              adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 hover:text-white underline transition-colors"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">What we don&apos;t do</h2>
            <ul className="space-y-1.5 list-disc list-inside text-zinc-500">
              <li>We do not sell your data to third parties</li>
              <li>We do not use your Google/YouTube data to train AI or machine-learning models</li>
              <li>We do not share your data with advertisers or use it for ad targeting</li>
              <li>We do not store raw video files or media content — only metadata and statistics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">Revoking access</h2>
            <p>
              You can revoke Aion&apos;s access to your Google/YouTube account at any time from your
              Google Account permissions page:{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 hover:text-white underline transition-colors"
              >
                https://myaccount.google.com/permissions
              </a>
              . You can also disconnect a platform from within your Aion account settings. Revoking
              access stops all further data collection immediately.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">Data retention and deletion</h2>
            <p>
              We retain your data only for as long as your account is active. If you disconnect your
              YouTube account or stop using Aion, the associated Google/YouTube data and OAuth tokens are
              deleted within 30 days. You can request immediate deletion of your account and all
              associated data at any time by emailing{" "}
              <a href="mailto:privacy@aion.app" className="text-zinc-300 hover:text-white underline transition-colors">
                privacy@aion.app
              </a>
              . We will action deletion requests and respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">Changes to this policy</h2>
            <p>
              If we make material changes to how we handle your data, we&apos;ll notify you by email
              before the changes take effect. Continued use of Aion after that date constitutes
              acceptance of the updated policy.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
