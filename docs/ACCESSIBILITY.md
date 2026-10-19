# Accessibility

## What is checked automatically

axe-core (WCAG 2.0, 2.1 and 2.2 levels A and AA) runs through Playwright. **Serious and critical findings fail the run.**

`e2e/a11y.spec.ts`:

- the public pages (home, sign in, sign up, guides, a guide, privacy, terms) in light and dark, and at 390 px wide;
- every main signed-in page, filled with the example data, in light and dark: Overview, Analytics, Candidates, Candidates import, Daily Queue, Follow-ups, Connections, People, Discover, Schools, Disciplines, Applications, Jobs, Resume, Employers, Saved searches, Hidden jobs, Notifications, Settings and Help;
- the skip link moves focus to the main content;
- pages fit a 320 px window (about 400% zoom) without sideways scrolling (home, sign in, guides, Overview, Applications, Candidates, Settings).

Other specs add: the interview prep page in light and dark (`e2e/interview-prep.spec.ts`), the sign-in page in French (`e2e/i18n.spec.ts`), and keyboard operation of the search palette, bulk selection (Space on a row checkbox, Enter on an action) and the shortcut rules (`e2e/command-palette.spec.ts`, `e2e/bulk-and-views.spec.ts`).

Run them with `npx playwright test e2e/a11y.spec.ts` (or the whole suite). Contrast is also unit-tested (`src/lib/contrast.test.ts`). Lighthouse accessibility scored 100 on the pages measured on 2026-10-17; that run predates the newest pages and has not been repeated.

Found and fixed by these scans so far:

- the toast dismiss button was hidden from assistive technology while still tabbable;
- the header **Search** button's visible text did not match its accessible name (axe `label-content-name-mismatch`).

**Not scanned automatically:** the signed-in app in French, the welcome dialog and tour popovers while open, the search palette while open, toasts, and pages reached only through a specific record state (for example a person's detail page, a job's detail page with its resume-track card, the compare-jobs page, and a finished Discover result with its evidence drawer).

## Language

The page's `lang` attribute follows the chosen language (`en` or `fr-CA`) on the signed-in app and the sign-in pages. The home page, guides and legal pages are English only and keep `lang="en"`.

## What a person still has to do

An automated scan finds roughly a third of real problems. **A manual screen-reader pass has not been done yet.** It is a launch gate.
Use this checklist with NVDA + Firefox (Windows), VoiceOver + Safari (Mac and iPhone), and record what you find as issues.

For each of Sign in / Sign up, Overview, Candidates (including the bulk action bar), Follow-ups, Applications (and Interview prep), Jobs, Settings, and the search palette (Ctrl+K), in English and in French:

1. Landmarks and headings: you can jump by region and by heading, and the order makes sense.
2. Every control has a name, a role and a state read aloud (tabs, switches, dropdowns, disclosures).
3. Forms: labels, hints and errors are read; an error moves focus or is announced.
4. Lists shown as cards on phones (People, Candidates, Connections, Employers): each card reads as a list item, each value is tied to its label.
5. The welcome dialog and tour: focus enters, is trapped, and returns; Escape works; each tour stop is announced.
6. Toasts: a saved or failed message is announced once.
7. Charts have a text alternative with the same facts.
8. Everything works with the keyboard alone, at 200% zoom, with increased text spacing and with reduced motion.
