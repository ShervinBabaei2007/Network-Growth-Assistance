/**
 * The alert email: job titles, companies, places and links to the app. Plain text plus a
 * simple HTML copy. No resume content, no tracking pixels, no remote images, no click
 * tracking: links go straight to the app.
 */

export type DigestJob = { title: string; company: string | null; place: string | null; jobId: string };
export type Digest = { searchName: string; jobs: DigestJob[]; appUrl: string; unsubscribeUrl: string; unsubscribeAllUrl: string };

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** Header-safe: no line breaks (header injection), trimmed to a sensible length. */
export const headerSafe = (s: string) => s.replace(/[\r\n]+/g, " ").trim().slice(0, 150);

export function renderDigest(d: Digest): { subject: string; text: string; html: string } {
  const n = d.jobs.length;
  const subject = headerSafe(`${n} new job${n === 1 ? "" : "s"} for ${d.searchName}`);
  const shown = d.jobs.slice(0, 20);
  const more = n - shown.length;
  const line = (j: DigestJob) => [j.title, j.company, j.place].filter(Boolean).join(" · ");
  const link = (j: DigestJob) => `${d.appUrl}/jobs/${j.jobId}`;
  const all = `${d.appUrl}/notifications`;

  const text = [
    `New jobs for your saved search "${d.searchName}":`,
    "",
    ...shown.map((j) => `- ${line(j)}\n  ${link(j)}`),
    ...(more > 0 ? ["", `…and ${more} more: ${all}`] : []),
    "",
    "Each job's link is checked in the app before Apply is turned on.",
    "",
    `Stop emails for this search: ${d.unsubscribeUrl}`,
    `Stop all emails: ${d.unsubscribeAllUrl}`,
  ].join("\n");

  const items = shown
    .map((j) => `<li><a href="${escapeHtml(link(j))}">${escapeHtml(j.title)}</a>${j.company ? ` · ${escapeHtml(j.company)}` : ""}${j.place ? ` · ${escapeHtml(j.place)}` : ""}</li>`)
    .join("");
  const html = [
    `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">`,
    `<p>New jobs for your saved search <strong>${escapeHtml(d.searchName)}</strong>:</p>`,
    `<ul>${items}</ul>`,
    more > 0 ? `<p><a href="${escapeHtml(all)}">…and ${more} more</a></p>` : "",
    `<p style="color:#555">Each job's link is checked in the app before Apply is turned on.</p>`,
    `<p style="color:#555;font-size:13px"><a href="${escapeHtml(d.unsubscribeUrl)}">Stop emails for this search</a> · <a href="${escapeHtml(d.unsubscribeAllUrl)}">Stop all emails</a></p>`,
    `</body></html>`,
  ].join("\n");
  return { subject, text, html };
}
