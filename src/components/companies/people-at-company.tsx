import Link from "next/link";
import { ExternalLink, Telescope } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aiAccess } from "@/lib/job-postings/ai";
import { companySlug } from "@/lib/companies/match";
import { peopleAtCompany, type PersonAtCompany } from "@/lib/companies/people";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ReferralActions, SameCompanyButtons } from "./person-actions";

/**
 * "People at {company}": people the user knows there, why they matched, and how old that
 * is. Possible matches ask the user to decide. With an application, referrals and drafts.
 */
export async function PeopleAtCompany({ company, applicationId, city, onCompanyPage = false }: { company: string; applicationId?: string | null; city?: string | null; onCompanyPage?: boolean }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;
  const [{ confident, possible }, ai] = await Promise.all([peopleAtCompany(supabase, userId, company), aiAccess(supabase)]);
  const discover = `/discover?q=${encodeURIComponent(`Find people working at ${company}${city ? ` in ${city}` : ""}`)}`;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>People at {company}</CardTitle>
        <CardDescription>From your imported connections and saved People.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {confident.length ? (
          <ul className="grid gap-3">
            {confident.map((p) => (
              <PersonRow key={p.key} p={p} applicationId={applicationId ?? null} aiAvailable={ai.ok} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nobody you know is listed at {company}.</p>
        )}
        {possible.length ? (
          <div className="grid gap-2 border-t pt-3">
            <p className="text-sm font-medium">Possibly the same company</p>
            <ul className="grid gap-3">
              {possible.map((p) => (
                <li key={p.key} className="grid gap-1 text-sm">
                  <span>
                    <strong className="font-medium">{p.name}</strong>
                    {p.title ? <span className="text-muted-foreground"> · {p.title}</span> : null} <span className="text-muted-foreground">at {p.company}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{p.match.reason}.</span>
                  <SameCompanyButtons jobCompany={company} theirCompany={p.company} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {onCompanyPage ? null : (
            <Link href={`/companies/${companySlug(company)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Everything at {company}
            </Link>
          )}
          <Link href={discover} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Telescope aria-hidden /> Find more people
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function PersonRow({ p, applicationId, aiAvailable }: { p: PersonAtCompany; applicationId: string | null; aiAvailable: boolean }) {
  return (
    <li className="grid gap-1.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2">
        {p.personId ? (
          <Link href={`/people/${p.personId}`} className="font-medium hover:underline">
            {p.name}
          </Link>
        ) : (
          <span className="font-medium">{p.name}</span>
        )}
        {p.title ? <span className="text-muted-foreground">{p.title}</span> : null}
        {p.linkedinUrl ? (
          <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">
            LinkedIn <ExternalLink aria-hidden className="size-3" />
          </a>
        ) : null}
      </div>
      <span className={cn("text-xs", p.evidence.stale ? "text-warning" : "text-muted-foreground")}>
        {p.evidence.label}
        {p.evidence.stale ? " · may have changed jobs since" : ""}
        {p.match.level === "alias" ? ` · ${p.match.reason}` : ""}
      </span>
      {p.personId ? (
        <ReferralActions personId={p.personId} personName={p.name} applicationId={applicationId} aiAvailable={aiAvailable} />
      ) : (
        <span className="text-xs text-muted-foreground">An imported connection. Save them from Discover to track a referral.</span>
      )}
    </li>
  );
}
