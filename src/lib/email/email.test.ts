import { describe, expect, it } from "vitest";
import { headerSafe, renderDigest } from "./digest";
import { readUnsubscribeToken, unsubscribeToken } from "./unsubscribe";

const SECRET = "x".repeat(40);

describe("unsubscribe tokens", () => {
  it("round-trip the user and search", () => {
    const t = unsubscribeToken({ userId: "u1", searchId: "s1" }, SECRET);
    expect(readUnsubscribeToken(t, SECRET)).toEqual({ userId: "u1", searchId: "s1" });
    expect(readUnsubscribeToken(unsubscribeToken({ userId: "u1", searchId: null }, SECRET), SECRET)).toEqual({ userId: "u1", searchId: null });
  });

  it("reject a changed token, the wrong secret and expiry", () => {
    const t = unsubscribeToken({ userId: "u1", searchId: "s1" }, SECRET);
    const [, mac] = t.split(".");
    const forged = `${Buffer.from(JSON.stringify({ u: "u2", s: null, e: 9e9 })).toString("base64url")}.${mac}`;
    expect(readUnsubscribeToken(forged, SECRET)).toBeNull();
    expect(readUnsubscribeToken(t, "y".repeat(40))).toBeNull();
    expect(readUnsubscribeToken(t, SECRET, Date.now() + 400 * 86_400_000)).toBeNull();
    expect(readUnsubscribeToken("garbage", SECRET)).toBeNull();
  });
});

describe("digest", () => {
  const d = {
    searchName: "Developer · BC",
    jobs: [{ title: "Dev <script>", company: "Acme & Co", place: "Vancouver", jobId: "j1" }],
    appUrl: "https://app.example",
    unsubscribeUrl: "https://app.example/api/email/unsubscribe?token=a",
    unsubscribeAllUrl: "https://app.example/api/email/unsubscribe?token=b",
  };

  it("escapes HTML and links to the app", () => {
    const { subject, text, html } = renderDigest(d);
    expect(subject).toBe("1 new job for Developer · BC");
    expect(html).toContain("Dev &lt;script&gt;");
    expect(html).toContain("Acme &amp; Co");
    expect(html).not.toContain("<script>");
    expect(text).toContain("https://app.example/jobs/j1");
    expect(text).toContain("Stop all emails");
  });

  it("has no images or tracking", () => {
    expect(renderDigest(d).html).not.toMatch(/<img|pixel|utm_/i);
  });

  it("keeps headers on one line", () => {
    expect(headerSafe("New\r\nBcc: x@evil.example")).toBe("New Bcc: x@evil.example");
  });
});
