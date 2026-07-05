export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-10 block">
          ← Back to CreatorIQ
        </a>

        <h1 className="text-2xl font-semibold mb-1">Privacy Policy</h1>
        <p className="text-xs text-zinc-500 mb-10">Last updated: 5 July 2026</p>

        <div className="space-y-8 text-sm text-zinc-400 leading-relaxed">
          <section>
            <h2 className="text-base font-medium text-white mb-2">What we collect</h2>
            <p>
              When you connect a platform account, CreatorIQ accesses the data that platform makes
              available via its API:
            </p>
            <ul className="mt-3 space-y-1.5 list-disc list-inside text-zinc-500">
              <li>YouTube: channel statistics, video performance data, analytics metrics, and your Google profile email</li>
              <li>Instagram: business account statistics, follower count, and media count</li>
              <li>TikTok: profile info, follower count, video count, and engagement metrics</li>
            </ul>
            <p className="mt-3">
              We also collect basic usage data — which features you use, how often you use them — to
              improve the product. We do not collect payment card details directly; billing is handled
              by Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">How we use it</h2>
            <p>
              Your platform data is used exclusively to generate the content analysis and AI insights
              you see in the app. Specifically:
            </p>
            <ul className="mt-3 space-y-1.5 list-disc list-inside text-zinc-500">
              <li>Channel and video data is pre-processed locally, then sent in compressed form to our AI provider (Anthropic) to generate your content brief and channel analysis</li>
              <li>Your email is used for account identification and, where applicable, product notifications</li>
              <li>Usage data is used to understand which features are working and to prioritise improvements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">What we don&apos;t do</h2>
            <ul className="space-y-1.5 list-disc list-inside text-zinc-500">
              <li>We do not sell your data to third parties</li>
              <li>We do not use your content or channel data to train AI models</li>
              <li>We do not share your data with advertisers</li>
              <li>We do not store raw video files or media content — only metadata and statistics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">Data storage</h2>
            <p>
              Your data is stored in Supabase (PostgreSQL), hosted on infrastructure in the United
              States. Platform OAuth tokens are stored encrypted at rest and are only used to fetch
              updated channel data on your behalf. You can revoke access at any time by disconnecting
              a platform from within your account settings or by revoking CreatorIQ&apos;s access
              directly in the relevant platform&apos;s settings.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">Third-party services</h2>
            <p>
              CreatorIQ uses the following third-party services, each governed by their own privacy
              policies:
            </p>
            <ul className="mt-3 space-y-1.5 list-disc list-inside text-zinc-500">
              <li>Anthropic — AI analysis (your compressed channel data is sent here)</li>
              <li>Supabase — database and infrastructure</li>
              <li>Vercel — hosting and deployment</li>
              <li>Stripe — payment processing (when billing is active)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">Your rights</h2>
            <p>
              You can request deletion of your account and all associated data at any time. To do
              so, or with any privacy questions, contact us at{" "}
              <a href="mailto:privacy@creatoriq.app" className="text-zinc-300 hover:text-white transition-colors">
                privacy@creatoriq.app
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-2">Changes to this policy</h2>
            <p>
              If we make material changes to how we handle your data, we&apos;ll notify you by email
              before the changes take effect. Continued use of CreatorIQ after that date constitutes
              acceptance of the updated policy.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
