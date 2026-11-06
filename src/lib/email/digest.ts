/**
 * The alert email: job titles, companies, places and links to the app. Plain text plus a
 * simple HTML copy. No resume content, no tracking pixels, no remote images, no click
 * tracking: links go straight to the app.
 */

import { DEFAULT_LOCALE, translator, type Locale } from "@/lib/i18n";

export type DigestJob = { title: string; company: string | null; place: string | null; jobId: string };
export type Digest = { searchName: string; jobs: DigestJob[]; appUrl: string; unsubscribeUrl: string; unsubscribeAllUrl: string };

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** Header-safe: no line breaks (header injection), trimmed to a sensible length. */
export const headerSafe = (s: string) => s.replace(/[\r\n]+/g, " ").trim().slice(0, 150);

/** `locale` is the recipient's saved language; English when none is saved. */
export function renderDigest(d: Digest, locale: Locale = DEFAULT_LOCALE): { subject: string; text: string; html: string } {
  const t = translator(locale);
  const n = d.jobs.length;
  const subject = headerSafe(n === 1 ? t("digestEmail.subjectOne", { search: d.searchName }) : t("digestEmail.subjectMany", { count: n, search: d.searchName }));
  const shown = d.jobs.slice(0, 20);
  const more = n - shown.length;
  const line = (j: DigestJob) => [j.title, j.company, j.place].filter(Boolean).join(" · ");
  const link = (j: DigestJob) => `${d.appUrl}/jobs/${j.jobId}`;
  const all = `${d.appUrl}/notifications`;

  const text = [
    t("digestEmail.intro", { search: d.searchName }),
    "",
    ...shown.map((j) => `- ${line(j)}\n  ${link(j)}`),
    ...(more > 0 ? ["", `${t("digestEmail.more", { count: more })}: ${all}`] : []),
    "",
    t("digestEmail.linkChecked"),
    "",
    `${t("digestEmail.stopThis")}: ${d.unsubscribeUrl}`,
    `${t("digestEmail.stopAll")}: ${d.unsubscribeAllUrl}`,
  ].join("\n");

  const items = shown
    .map((j) => `<li><a href="${escapeHtml(link(j))}">${escapeHtml(j.title)}</a>${j.company ? ` · ${escapeHtml(j.company)}` : ""}${j.place ? ` · ${escapeHtml(j.place)}` : ""}</li>`)
    .join("");
  const html = [
    `<!doctype html><html lang="${locale}"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">`,
    `<p>${escapeHtml(t("digestEmail.intro", { search: d.searchName }))}</p>`,
    `<ul>${items}</ul>`,
    more > 0 ? `<p><a href="${escapeHtml(all)}">${escapeHtml(t("digestEmail.more", { count: more }))}</a></p>` : "",
    `<p style="color:#555">${escapeHtml(t("digestEmail.linkChecked"))}</p>`,
    `<p style="color:#555;font-size:13px"><a href="${escapeHtml(d.unsubscribeUrl)}">${escapeHtml(t("digestEmail.stopThis"))}</a> · <a href="${escapeHtml(d.unsubscribeAllUrl)}">${escapeHtml(t("digestEmail.stopAll"))}</a></p>`,
    `</body></html>`,
  ].join("\n");
  return { subject, text, html };
}
