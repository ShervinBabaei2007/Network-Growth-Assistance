"use client";

import { useTr } from "@/lib/i18n/client";
import { FormError } from "@/components/form-error";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NetworkingCriteria } from "@/lib/discovery/criteria";

// Examples from different fields: anyone can look for anyone.
const EXAMPLES = [
  "Find 25 McGill Nursing alumni working as registered nurses in Montreal",
  "Find 30 law school graduates working as litigation associates at firms in Toronto",
  "Find 20 Computer Science alumni working as software engineers at startups",
];

async function start(body: { query: string; criteria?: NetworkingCriteria | null; parentSearchId?: string | null }, tr: ReturnType<typeof useTr>): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch("/api/network/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok) return { error: json.error ?? tr("msg.couldnTStartThe75a8", "Couldn't start the search. Try again.") };
    return json;
  } catch {
    return { error: tr("msg.couldnTReachThe62e7", "Couldn't reach the server. Check your connection and try again.") };
  }
}

/** The natural-language request box. */
export function DiscoverForm({ initialQuery = "", error: initialError }: { initialQuery?: string; error?: string }) {
  const tr = useTr();
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await start({ query }, tr);
      if (r.id) router.push(`/discover/${r.id}`);
      else setError(r.error ?? tr("msg.couldnTStartThe5948", "Couldn't start the search."));
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-3" aria-label={tr("msg.findPeoplea5d7", "Find people")}>
      <Label htmlFor="discoverQuery" className="sr-only">
        {tr("msg.whoWouldYouLike22f9", "Who would you like to meet?")}
      </Label>
      <Textarea
        id="discoverQuery"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder={tr("msg.eGFind25ef10", "e.g. Find 25 alumni of my school who studied my program and now work in my field")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || query.trim().length < 3}>
          <Search aria-hidden /> {pending ? tr("msg.startingc04b", "Starting…") : tr("msg.findPeoplea5d7", "Find people")}
        </Button>
        {error ? (
          <FormError>
            {error}
          </FormError>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs text-muted-foreground">{tr("msg.try0888", "Try:")}</p>
        <ul className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button type="button" onClick={() => setQuery(ex)} className="rounded-full border px-3 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** Edit the structured criteria of an earlier search and run it as a new one. */
export function CriteriaEditor({ query, criteria, parentSearchId }: { query: string; criteria: NetworkingCriteria; parentSearchId: string }) {
  const tr = useTr();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const year = (k: string) => (text(k) ? Number(text(k)) : null);
    const next: NetworkingCriteria = {
      targetCount: Math.min(100, Math.max(1, Number(text("targetCount")) || criteria.targetCount)),
      education: {
        institution: text("institution") || null,
        institutionAliases: list(text("aliases")),
        vettedAliases: criteria.education.vettedAliases,
        institutionDomains: list(text("domains")),
        programs: list(text("programs")),
        programAliases: list(text("programAliases")),
        broadenEce: false,
        graduationYearMin: year("gradMin"),
        graduationYearMax: year("gradMax"),
        status: (["alumni", "student"].includes(text("status")) ? text("status") : "any") as NetworkingCriteria["education"]["status"],
      },
      roles: list(text("roles")),
      locations: list(text("locations")),
      country: text("country") || null,
      companies: list(text("companies")),
      includeStartups: f.get("startups") === "on",
      excludeExistingConnections: f.get("exclude") === "on",
      goal: text("goal") || null,
    };
    setError(null);
    startTransition(async () => {
      const r = await start({ query, criteria: next, parentSearchId }, tr);
      if (r.id) router.push(`/discover/${r.id}`);
      else setError(r.error ?? tr("msg.couldnTStartThe5948", "Couldn't start the search."));
    });
  };

  const c = criteria;
  const field = (id: string, label: string, value: string, hint?: string, type = "text") => (
    <div className="grid gap-1.5">
      <Label htmlFor={`ce-${id}`}>{label}</Label>
      <Input id={`ce-${id}`} name={id} type={type} defaultValue={value} aria-describedby={hint ? `ce-${id}-hint` : undefined} />
      {hint ? (
        <p id={`ce-${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("targetCount", tr("msg.howManyPeopled660", "How many people"), String(c.targetCount), undefined, "number")}
        {field("institution", "School", c.education.institution ?? "")}
        {field("aliases", tr("msg.schoolAlsoWrittenAs1de1", "School also written as"), c.education.institutionAliases.join(", "), tr("msg.commaSeparatedShortFormsd197", "Comma-separated short forms people use for it"))}
        {field("domains", tr("msg.schoolWebsiteOptional2afe", "School website (optional)"), c.education.institutionDomains.join(", "), tr("msg.eGItsDomainb516", "e.g. its domain, so its own pages can be searched"))}
        {field("programs", tr("msg.programsOrFields37a3", "Programs or fields"), c.education.programs.join(", "), tr("msg.commaSeparatedAnyFieldf559", "Comma-separated, any field"))}
        {field("programAliases", tr("msg.programsAlsoWrittenAs1bac", "Programs also written as"), c.education.programAliases.join(", "), tr("msg.commaSeparatedAbbreviationsAnd072c", "Comma-separated abbreviations and other names, e.g. a degree's short form"))}
        {field("roles", "Roles", c.roles.join(", "))}
        {field("companies", tr("msg.companiesedef", "Companies"), c.companies.join(", "))}
        {field("locations", tr("msg.citiesOrRegions64e0", "Cities or regions"), c.locations.join(", "))}
        {field("country", tr("msg.locatedInCountryce8c", "Located in country"), c.country ?? "", tr("msg.onlyPeopleShownTo8d7e", "Only people shown to live or work there can be verified. Leave blank for anywhere."))}
        {field("gradMin", tr("msg.graduatedFromYeare95f", "Graduated from (year)"), c.education.graduationYearMin?.toString() ?? "", undefined, "number")}
        {field("gradMax", tr("msg.graduatedByYear4da4", "Graduated by (year)"), c.education.graduationYearMax?.toString() ?? "", undefined, "number")}
      </div>
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="ce-status">{tr("msg.who4ee9", "Who")}</Label>
        <AppSelect id="ce-status" name="status" defaultValue={c.education.status}>
          <option value="any">{tr("msg.studentsAndAlumnia944", "Students and alumni")}</option>
          <option value="alumni">{tr("msg.alumniOnlyc485", "Alumni only")}</option>
          <option value="student">{tr("msg.currentStudentsOnlye3e3", "Current students only")}</option>
        </AppSelect>
      </div>
      {field("goal", tr("msg.yourGoalForThis8a7a", "Your goal for this search (optional)"), c.goal ?? "", tr("msg.usedToRankPeoplee597", "Used to rank people and word explanations, e.g. what you're hoping to learn or find"))}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox name="startups" defaultChecked={c.includeStartups} />
          {tr("msg.startupsAreFined784", "Startups are fine")}
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="exclude" defaultChecked={c.excludeExistingConnections} />
          Leave out people I&apos;m already connected with
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? tr("msg.startingc04b", "Starting…") : tr("msg.runModifiedSearchc682", "Run modified search")}
        </Button>
        {error ? (
          <FormError>
            {error}
          </FormError>
        ) : null}
      </div>
    </form>
  );
}
