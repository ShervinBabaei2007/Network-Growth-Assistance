import { describe, expect, it, vi } from "vitest";
import { analyzeJob, groundJobAnalysis } from "@/lib/job-postings/job-analysis";
import { buildImprovementNotes, mergeAiNotes, notesForPrompt } from "@/lib/job-postings/improvement-notes";
import { indexResume, matchFree, resumeLinesFrom } from "@/lib/job-postings/match";
import { extractRequirements } from "@/lib/job-postings/requirements";
import { AiResume, groundAiResume, resumeText } from "@/lib/job-postings/resume";
import { tailorDocument, writeCoverLetter } from "@/lib/job-postings/tailor";
import { ResumeProfile } from "@/lib/job-postings/types";
import { AiCoverLetterSchema, AiJobAnalysisSchema, AiNotesSchema, AiTailoredResumeSchema, type AiTailoredResumeOut, type JobContext } from "./provider";

vi.mock("server-only", () => ({}));

const { GeminiLLM, GEMINI_DEFAULT_MODEL, geminiModel, geminiSchema, looksLikeGeminiKey } = await import("./gemini-provider");
const { LlmAIProvider } = await import("./llm-ai-provider");
const { defaultLLM, keyVendor, llmForKey, vendorOf } = await import("./default-llm");

/**
 * Gemini without the network: a stand-in fetch that answers like the Gemini API's
 * generateContent and records each request. CI never calls Google.
 */
const KEY = "AIzaSyTEST-not-a-real-key-000000000000";
type Answer = { status?: number; body?: unknown; raw?: string; throws?: Error };
const ok = (data: unknown, finishReason = "STOP"): Answer => ({ body: { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] }, finishReason }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } } });

function gemini(...answers: Answer[]) {
  const requests: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init!, body: JSON.parse(String(init?.body ?? "{}")) });
    const a = answers.length > 1 ? answers.shift()! : answers[0];
    if (!a) throw new Error("no answer queued");
    if (a.throws) throw a.throws;
    return new Response(a.raw ?? JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const llm = new GeminiLLM(KEY, { model: "gemini-test-flash", fetchImpl });
  return { llm, requests, fetchImpl, ai: new LlmAIProvider(llm, "Google Gemini") };
}

const NoteOut = AiCoverLetterSchema;
const letter = { greeting: "Dear Hiring Manager,", paragraphs: ["I'm applying for the Full Stack Developer role."], closing: "Sincerely," };
const ask = (llm: InstanceType<typeof GeminiLLM>) => llm.structured({ tier: "smart", system: "sys", user: "hello", schema: NoteOut });

describe("GeminiLLM: the official REST API, structured output", () => {
  it("sends the key only in a header, asks for JSON in the schema's shape, and validates the answer", async () => {
    const { llm, requests } = gemini(ok(letter));
    expect(await ask(llm)).toEqual({ ok: true, data: letter });
    const { url, init, body } = requests[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test-flash:generateContent");
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(body).toMatchObject({ systemInstruction: { parts: [{ text: "sys" }] }, contents: [{ role: "user", parts: [{ text: "hello" }] }], generationConfig: { responseMimeType: "application/json" } });
    expect((body.generationConfig as Record<string, unknown>).responseJsonSchema).toMatchObject({ type: "object", required: ["greeting", "paragraphs", "closing"] });
    expect(llm.usage).toMatchObject({ calls: 1, inputTokens: 10, outputTokens: 5 });
  });

  it("ignores thought parts and reads only the answer", async () => {
    const { llm } = gemini({ body: { candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: JSON.stringify(letter) }] }, finishReason: "STOP" }] } });
    expect(await ask(llm)).toEqual({ ok: true, data: letter });
  });

  it("rejects malformed output instead of using any of it", async () => {
    expect(await ask(gemini({ body: { candidates: [{ content: { parts: [{ text: "{not json" }] }, finishReason: "STOP" }] } }).llm)).toMatchObject({ ok: false, reason: expect.stringMatching(/expected format/) });
    expect(await ask(gemini(ok({ greeting: "Hi" })).llm)).toMatchObject({ ok: false, reason: expect.stringMatching(/failed validation/) });
    expect(await ask(gemini({ body: { candidates: [] } }).llm)).toMatchObject({ ok: false, reason: expect.stringMatching(/no answer/) });
    expect(await ask(gemini({ raw: "<html>" }).llm)).toMatchObject({ ok: false });
  });

  it.each([
    ["rate limit or exhausted free quota", { status: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } } }, /free limit is used up or it's busy/],
    ["invalid key", { status: 400, body: { error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } } }, /key was rejected/],
    ["forbidden key", { status: 403 }, /key was rejected/],
    ["outage", { status: 503 }, /returned an error \(503\)/],
    ["server error", { status: 500 }, /returned an error \(500\)/],
    ["timeout", { throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) }, /took too long/],
    ["network failure", { throws: new TypeError("fetch failed") }, /Couldn't reach/],
    ["safety refusal", ok(letter, "SAFETY"), /declined/],
    ["blocked prompt", { body: { promptFeedback: { blockReason: "OTHER" } } }, /declined/],
    ["cut-off answer", ok(letter, "MAX_TOKENS"), /cut off/],
  ] as const)("turns %s into a plain failure", async (_, answer, reason) => {
    const r = await ask(gemini(answer as Answer).llm);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(reason) });
    // Never the key, never raw provider text.
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("is off without a key and never calls out", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    // Whatever the shell running the tests has set.
    vi.stubEnv("GEMINI_API_KEY", "");
    const off = new GeminiLLM(undefined, { fetchImpl });
    vi.unstubAllEnvs();
    expect(off.enabled).toBe(false);
    expect(await ask(off)).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads the model from GEMINI_MODEL in one place, with a current Flash default", () => {
    expect(geminiModel({})).toBe(GEMINI_DEFAULT_MODEL);
    expect(GEMINI_DEFAULT_MODEL).toMatch(/^gemini-[\d.]+-flash/);
    expect(geminiModel({ GEMINI_MODEL: "gemini-3.6-flash" })).toBe("gemini-3.6-flash");
    expect(geminiModel({ GEMINI_MODEL: "models/gemini-3.6-flash" })).toBe("gemini-3.6-flash");
    expect(geminiModel({ GEMINI_MODEL: "../../evil?x=1" })).toBe(GEMINI_DEFAULT_MODEL);
  });

  it("turns every AI schema into JSON Schema Gemini accepts", () => {
    for (const schema of [AiTailoredResumeSchema, AiCoverLetterSchema, AiJobAnalysisSchema, AiNotesSchema, AiResume]) {
      const json = JSON.stringify(geminiSchema(schema));
      expect(json).not.toContain("$schema");
      expect(json).not.toMatch(/"(pattern|maxLength|minLength|const)"/);
    }
    const tailored = geminiSchema(AiTailoredResumeSchema) as { properties: Record<string, { type?: unknown; items?: { enum?: string[] } }> };
    // Nullable as a type list, which Gemini's structured output supports.
    expect(tailored.properties.summary.type).toEqual(["string", "null"]);
    expect(tailored.properties.sectionOrder.items?.enum).toEqual(expect.arrayContaining(["experience", "projects", "education"]));
  });
});

describe("choosing the model service", () => {
  it("uses Gemini by default, Anthropic only when it's the one key set, and nothing without keys", () => {
    expect(vendorOf(defaultLLM({ GEMINI_API_KEY: KEY, ANTHROPIC_API_KEY: "sk-ant-x" }))).toBe("gemini");
    expect(vendorOf(defaultLLM({ ANTHROPIC_API_KEY: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz" }))).toBe("anthropic");
    const none = defaultLLM({});
    expect(none.enabled).toBe(false);
    expect(vendorOf(none)).toBeNull();
  });

  it("recognises a user's own key by its shape", () => {
    expect(looksLikeGeminiKey(KEY)).toBe(true);
    expect(keyVendor(KEY)).toBe("gemini");
    expect(keyVendor("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBe("anthropic");
    expect(keyVendor("hello")).toBeNull();
    expect(vendorOf(llmForKey(KEY)!)).toBe("gemini");
    expect(llmForKey("not a key")).toBeNull();
  });
});

// ------------------------------------------------------------------ the app's AI features on Gemini

const profile = ResumeProfile.parse({
  name: "Sam Lee",
  email: "sam@example.com",
  phone: null,
  location: "Burnaby, BC",
  links: [],
  summary: "Developer who builds reliable web apps.",
  experience: [
    {
      id: "x1",
      organization: "Acme Corp",
      title: "Software Developer Co-op",
      start: "May 2024",
      end: "Dec 2024",
      location: null,
      bullets: [
        { id: "x1b1", text: "Organized the team's weekly demo schedule" },
        { id: "x1b2", text: "Built backend functionality for the ordering application in Node.js and PostgreSQL" },
        { id: "x1b3", text: "Wrote React components for the checkout page" },
      ],
    },
  ],
  education: [{ id: "d1", organization: "BCIT", title: "Diploma, Computer Systems Technology", start: "2023", end: "2025", location: null, bullets: [] }],
  projects: [{ id: "p1", organization: "Course Planner", title: null, start: null, end: null, location: null, bullets: [{ id: "p1b1", text: "TypeScript and React app for planning courses" }] }],
  skills: ["Excel", "Jira", "React", "Node.js", "PostgreSQL", "TypeScript"],
  certifications: [],
});
const raw = resumeText(profile, "");
const POSTING = `Full Stack Developer
Requirements
• React and TypeScript
• Node.js REST APIs
• PostgreSQL
• AWS
Nice to have
• Docker`;
const requirements = extractRequirements(POSTING);
const results = matchFree(requirements, indexResume(resumeLinesFrom(profile)), null, { met: 0.86, partial: 0.8 });
const analysis = analyzeJob({ title: "Full Stack Developer", description: POSTING }, requirements);
const context: JobContext & { resumeText: string; format: "resume" } = {
  profile,
  posting: { title: "Full Stack Developer", company: "Maple", description: POSTING },
  requirements,
  results,
  keywords: analysis.atsKeywords.map((k) => k.term),
  mode: "normal",
  resumeText: raw,
  format: "resume",
};

const unchanged: AiTailoredResumeOut = {
  summary: profile.summary,
  skills: profile.skills,
  experience: [{ sourceId: "x1", bullets: profile.experience[0].bullets.map((b) => ({ text: b.text, sourceBulletIds: [b.id] })) }],
  projects: [{ sourceId: "p1", bullets: [{ text: "TypeScript and React app for planning courses", sourceBulletIds: ["p1b1"] }] }],
  sectionOrder: ["experience", "projects", "education"],
};

/** A real rewrite, plus an invented skill (AWS) and an invented metric (40%) for the guard to catch. */
const rewritten: AiTailoredResumeOut = {
  summary: "Full stack developer with co-op experience building backend services in Node.js and PostgreSQL and React interfaces in TypeScript.",
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS", "Kubernetes", "Excel"],
  experience: [
    {
      sourceId: "x1",
      bullets: [
        { text: "Developed backend services in Node.js and PostgreSQL for the ordering application", sourceBulletIds: ["x1b2"] },
        { text: "Implemented checkout page features as React components, cutting load time by 40%", sourceBulletIds: ["x1b3"] },
        { text: "Coordinated weekly team demos", sourceBulletIds: ["x1b1"] },
      ],
    },
  ],
  projects: [{ sourceId: "p1", bullets: [{ text: "Course planning web app built with React and TypeScript", sourceBulletIds: ["p1b1"] }] }],
  sectionOrder: ["experience", "projects", "education"],
};
/** The same rewrite once the model has fixed what the guard reported. */
const clean: AiTailoredResumeOut = {
  ...rewritten,
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "Excel"],
  experience: [{ sourceId: "x1", bullets: rewritten.experience[0].bullets.map((b) => (b.sourceBulletIds[0] === "x1b3" ? { ...b, text: "Implemented checkout page features as React components" } : b)) }],
};

describe("resume tailoring on Gemini keeps every guard", () => {
  it("strips invented skills and metrics, retries once with the reasons, and saves a material, truthful rewrite", async () => {
    const before = JSON.stringify(profile);
    const { ai, requests } = gemini(ok(rewritten), ok(clean));
    const r = await tailorDocument(ai, context);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[1].body)).toMatch(/FEEDBACK ON YOUR PREVIOUS ATTEMPT/);
    expect(r.materiality.material).toBe(true);
    const text = JSON.stringify(r.doc);
    expect(text).not.toMatch(/AWS|Kubernetes|40%/);
    expect(JSON.stringify(profile)).toBe(before);
  });

  it("removes what the resume doesn't support even when the retry still invents it", async () => {
    const { ai } = gemini(ok(rewritten), ok(rewritten));
    const r = await tailorDocument(ai, context);
    if (!r.ok) throw new Error("expected a document");
    expect(JSON.stringify(r.doc)).not.toMatch(/AWS|Kubernetes|40%/);
    expect(r.issues.map((i) => i.text)).toEqual(expect.arrayContaining(["AWS"]));
  });

  it("gives up with no document when both attempts are near-identical (not material)", async () => {
    const { ai, requests } = gemini(ok(unchanged), ok(unchanged));
    const r = await tailorDocument(ai, context);
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[1].body)).toMatch(/too close to the original/);
    expect(r).toMatchObject({ ok: false, reason: "not_material" });
    expect("doc" in r).toBe(false);
  });

  it("when Gemini is unavailable, returns no document and the rule-based Improvement Notes still work", async () => {
    for (const answer of [{ status: 429 }, { status: 503 }, { throws: Object.assign(new Error("t"), { name: "TimeoutError" }) }, ok({ wrong: true })] as Answer[]) {
      const before = JSON.stringify(profile);
      const r = await tailorDocument(gemini(answer).ai, context);
      expect(r).toMatchObject({ ok: false, reason: "ai_failed" });
      expect("doc" in r).toBe(false);
      expect(JSON.stringify(profile)).toBe(before);
    }
    const applicant = { years: 0.7, degree: "diploma" as const, facts: { workAuthorization: "citizen" as const, securityClearance: false, willingToRelocate: false, yearsOverride: null } };
    const notes = buildImprovementNotes({ profile, analysis, requirements, results, applicant, posting: context.posting });
    // Deterministic notes are labelled as such, never as AI.
    expect(notes.method).toBe("rules");
    expect(notes.notes.every((n) => n.source === "rules")).toBe(true);
    expect(notes.comparison.notFound.map((k) => k.term)).toContain("AWS");
  });

  it("writes a CV that keeps every line", async () => {
    const { ai } = gemini(ok(clean));
    const r = await tailorDocument(ai, { ...context, format: "cv" });
    if (!r.ok) throw new Error("expected a CV");
    const ids = r.doc.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets.flatMap((b) => b.sourceBulletIds)));
    expect(ids).toEqual(expect.arrayContaining(["x1b1", "x1b2", "x1b3", "p1b1"]));
  });
});

describe("other AI features on Gemini", () => {
  it("writes a cover letter, checked by the same guard", async () => {
    const good = { greeting: "Dear Hiring Manager,", paragraphs: ["I'm applying for the Full Stack Developer role at Maple.", "At Acme Corp I built backend functionality in Node.js and PostgreSQL and wrote React components."], closing: "Sincerely," };
    const r = await writeCoverLetter(gemini(ok(good)).ai, context);
    expect(r).toMatchObject({ ok: true });
    const bad = await writeCoverLetter(gemini(ok({ ...good, paragraphs: ["I have five years of AWS experience at Google."] })).ai, context);
    if (!bad.ok) throw new Error("expected a checked letter");
    expect(bad.doc.paragraphs.join(" ")).not.toMatch(/AWS|Google/);
    expect(bad.issues.map((i) => i.action)).toContain("removed");
    expect(await writeCoverLetter(gemini({ status: 429 }).ai, context)).toMatchObject({ ok: false });
  });

  it("extracts job requirements, keeping only what the posting says", async () => {
    const out = { requiredSkills: ["React", "TypeScript", "Kotlin"], preferredSkills: ["Docker"], responsibilities: [], requiredQualifications: [], preferredQualifications: [], keywords: ["React", "PostgreSQL"] };
    const res = await gemini(ok(out)).ai.extractJobRequirements({ title: "Full Stack Developer", description: POSTING });
    if (!res.ok) throw new Error("expected an analysis");
    const grounded = groundJobAnalysis(analysis, res.data, POSTING);
    expect(JSON.stringify(grounded)).not.toContain("Kotlin");
  });

  it("enriches Improvement Notes only with advice that passes the checks", async () => {
    const applicant = { years: 0.7, degree: "diploma" as const, facts: { workAuthorization: "citizen" as const, securityClearance: false, willingToRelocate: false, yearsOverride: null } };
    const rules = buildImprovementNotes({ profile, analysis, requirements, results, applicant, posting: context.posting });
    const out = {
      notes: [
        { section: "skills", priority: "high", target: null, recommendation: "Add Kubernetes to your skills.", why: "The posting mentions it." },
        { section: "experience", priority: "medium", target: "x1b2", recommendation: "If accurate, say the ordering backend exposes REST APIs.", why: "The posting asks for Node.js REST APIs." },
      ],
    };
    const res = await gemini(ok(out)).ai.generateResumeImprovementNotes({ ...context, ruleNotes: notesForPrompt(rules) });
    if (!res.ok) throw new Error("expected notes");
    const merged = mergeAiNotes(rules, res.data, profile, raw, POSTING);
    const recs = merged.report.notes.map((n) => n.recommendation).join("\n");
    expect(recs).not.toContain("Add Kubernetes");
    expect(merged.rejected).toBeGreaterThanOrEqual(1);
  });

  it("parses a resume, keeping only what the text says", async () => {
    const parsed = {
      name: "Sam Lee",
      email: "sam@example.com",
      phone: null,
      location: null,
      links: [],
      summary: null,
      experience: [
        { organization: "Acme Corp", title: "Software Developer Co-op", start: "May 2024", end: "Dec 2024", location: null, degree: null, major: null, graduation: null, bullets: ["Wrote React components for the checkout page"] },
        { organization: "Google", title: "Staff Engineer", start: "2019", end: "2023", location: null, degree: null, major: null, graduation: null, bullets: ["Led a team of 40"] },
      ],
      education: [],
      projects: [],
      skills: ["React", "Rust"],
      certifications: [],
      awards: [],
      activities: [],
    };
    const res = await gemini(ok(parsed)).ai.parseResume(raw);
    if (!res.ok) throw new Error(`expected a parse: ${res.reason}`);
    const grounded = groundAiResume(res.data, raw);
    expect(grounded.experience.map((e) => e.organization)).toEqual(["Acme Corp"]);
    expect(grounded.skills).not.toContain("Rust");
  });
});
