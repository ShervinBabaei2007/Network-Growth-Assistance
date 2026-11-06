import { LocaleScope } from "@/components/locale-scope";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n";
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
  const [{ confident, possible }, ai, t] = await Promise.all([peopleAtCompany(supabase, userId, company), aiAccess(supabase), getT()]);
  const discover = `/discover?q=${encodeURIComponent(`Find people working at ${company}${city ? ` in ${city}` : ""}`)}`;

  return (
    <LocaleScope groups={["companyPeople", "ui"]}>
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("companyPeople.title", { company })}</CardTitle>
        <CardDescription>{t("companyPeople.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {confident.length ? (
          <ul className="grid gap-3">
            {confident.map((p) => (
              <PersonRow key={p.key} p={p} t={t} applicationId={applicationId ?? null} aiAvailable={ai.ok} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("companyPeople.nobody", { company })}</p>
        )}
        {possible.length ? (
          <div className="grid gap-2 border-t pt-3">
            <p className="text-sm font-medium">{t("companyPeople.possibly")}</p>
            <ul className="grid gap-3">
              {possible.map((p) => (
                <li key={p.key} className="grid gap-1 text-sm">
                  <span>
                    <strong className="font-medium">{p.name}</strong>
                    {p.title ? <span className="text-muted-foreground"> · {p.title}</span> : null} <span className="text-muted-foreground">{t("companyPeople.at", { company: p.company })}</span>
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
              {t("companyPeople.everything", { company })}
            </Link>
          )}
          <Link href={discover} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Telescope aria-hidden /> {t("companyPeople.findMore")}
          </Link>
        </div>
      </CardContent>
    </Card>
    </LocaleScope>
  );
}

function PersonRow({ p, t, applicationId, aiAvailable }: { p: PersonAtCompany; t: Translator; applicationId: string | null; aiAvailable: boolean }) {
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
        {p.evidence.stale ? t("companyPeople.mayHaveChanged") : ""}
        {p.match.level === "alias" ? ` · ${p.match.reason}` : ""}
      </span>
      {p.personId ? (
        <ReferralActions personId={p.personId} personName={p.name} applicationId={applicationId} aiAvailable={aiAvailable} />
      ) : (
        <span className="text-xs text-muted-foreground">{t("companyPeople.imported")}</span>
      )}
    </li>
  );
}
