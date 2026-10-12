"use client";

import { ExternalLink, Search, UserRound } from "lucide-react";
import { givePersonFeedback, recordPersonEvent, resolveKnownMatch, savePerson, undoPersonFeedback } from "@/app/(app)/people/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PersonCard } from "@/lib/discovery/results";
import { PersonDrawer } from "./person-drawer";

/**
 * Links open in a new tab for the user to act on; the app never acts on LinkedIn itself.
 * LinkedIn: their own profile when they published it, otherwise a people search for them.
 */
export function ExternalLinks({ person: p }: { person: Pick<PersonCard, "personId" | "fullName" | "personalWebsite" | "githubUrl" | "linkedinUrl" | "linkedinSearchUrl"> }) {
  const opened = () => void recordPersonEvent(p.personId, "linkedin_opened");
  return (
    <>
      {p.linkedinUrl ? (
        <a
          href={p.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={opened}
          className={buttonVariants({ size: "sm" })}
          aria-label={`Open ${p.fullName}'s LinkedIn profile in a new tab`}
          title="Their own profile link, published on their GitHub, ORCID or website"
        >
          <UserRound aria-hidden /> LinkedIn profile <ExternalLink aria-hidden />
        </a>
      ) : (
        <a
          href={p.linkedinSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={opened}
          className={buttonVariants({ variant: "outline", size: "sm" })}
          aria-label={`Search LinkedIn for ${p.fullName} in a new tab`}
          title="Opens LinkedIn's people search for this name. Check it's the same person, then save their profile link in Notes."
        >
          <Search aria-hidden /> Find on LinkedIn <ExternalLink aria-hidden />
        </a>
      )}
      {p.personalWebsite ? (
        <a href={p.personalWebsite} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Website <ExternalLink aria-hidden />
        </a>
      ) : null}
      {p.githubUrl ? (
        <a href={p.githubUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          GitHub <ExternalLink aria-hidden />
        </a>
      ) : null}
    </>
  );
}

export function CardActions({ person: p, searchId }: { person: PersonCard; searchId: string }) {
  const { pending, run } = useActionRunner();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <PersonDrawer personId={p.personId} name={p.fullName} searchId={searchId} />
        <ExternalLinks person={p} />
        {!p.saved ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => savePerson(p.personId))}>
            Save
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => givePersonFeedback(p.personId, "not_relevant", searchId), { undo: () => undoPersonFeedback(p.personId, "not_relevant") })}
        >
          Not relevant
        </Button>
      </div>
    </div>
  );
}

/** "Is this one of your connections?" The answer is stored and reused by later searches. */
export function KnownMatchReview({ personId, name, confidence }: { personId: string; name: string | null; confidence: number | null }) {
  const { pending, run } = useActionRunner();
  return (
    <div className="grid gap-2 rounded-md bg-muted p-3 text-sm">
      <p>
        Possibly already connected{name ? ` (looks like ${name} in your connections)` : ""}
        {confidence !== null ? `, ${Math.round(confidence * 100)}% likely` : ""}. Same person?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resolveKnownMatch(personId, true))}>
          Yes, already connected
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resolveKnownMatch(personId, false))}>
          No, different person
        </Button>
      </div>
    </div>
  );
}
