import { Resend } from "resend";
import type { ChannelSummary } from "@/types";

interface SendBriefEmailParams {
  to: string;
  analysisId: string;
  summary: ChannelSummary;
  ideaTitle: string;
  estimatedPerformance: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Sends the weekly brief email via Resend. Fully self-contained and non-throwing:
// any failure (missing config, network, Resend error) is logged and swallowed so
// it can never break the analyze request that triggers it.
export async function sendBriefEmail({
  to,
  analysisId,
  summary,
  ideaTitle,
  estimatedPerformance,
}: SendBriefEmailParams): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      console.warn("[email] RESEND_API_KEY or EMAIL_FROM not set — skipping brief email");
      return;
    }
    if (!to) {
      console.warn("[email] No recipient email — skipping brief email for analysis %s", analysisId);
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const link = `${appUrl}/analysis/${analysisId}`;
    const channelTitle = summary?.channel?.title ?? "your channel";
    const headline = summary?.successPatterns?.synthesis?.headline ?? `This week's brief for ${channelTitle}`;

    const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111113;border:1px solid #27272a;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 24px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Your weekly brief</p>
                <h1 style="margin:0 0 24px;font-size:20px;line-height:1.4;font-weight:600;color:#ffffff;">${escapeHtml(headline)}</h1>
                <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;margin:0 0 24px;">
                  <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#71717a;">This week's idea</p>
                  <p style="margin:0 0 12px;font-size:16px;line-height:1.5;font-weight:600;color:#fafafa;">${escapeHtml(ideaTitle)}</p>
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#a1a1aa;">${escapeHtml(estimatedPerformance)}</p>
                </div>
                <a href="${escapeHtml(link)}" style="display:inline-block;background:#ff3040;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:10px;">View full brief</a>
                <p style="margin:24px 0 0;font-size:12px;color:#52525b;">${escapeHtml(channelTitle)} · CreatorIQ</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `Your weekly brief for ${channelTitle}`,
      html,
    });

    if (error) {
      console.error("[email] Resend send failed for analysis %s:", analysisId, error);
    } else {
      console.log("[email] Brief email sent to %s (analysis %s)", to, analysisId);
    }
  } catch (err) {
    console.error("[email] sendBriefEmail error (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}
