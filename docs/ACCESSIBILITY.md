# Accessibility

## What is checked automatically

`e2e/a11y.spec.ts` runs axe-core (WCAG 2.0, 2.1 and 2.2 levels A and AA) with Playwright:

- the public pages (home, sign in, sign up, guides, privacy, terms) in light and dark, and at 390 px wide;
- every main signed-in page, filled with the example data, in light and dark;
- the skip link moves focus to the main content;
- pages fit a 320 px window (about 400% zoom) without sideways scrolling.

**Serious and critical findings fail the run.** Run it with `npx playwright test e2e/a11y.spec.ts`.
Contrast is also unit-tested (`src/lib/contrast.test.ts`) and Lighthouse accessibility is 100 on the pages measured.

Found and fixed by the first scan: the toast dismiss button was hidden from assistive technology while still tabbable.

## What a person still has to do

An automated scan finds roughly a third of real problems. **A manual screen-reader pass has not been done yet.** It is a launch gate.
Use this checklist with NVDA + Firefox (Windows), VoiceOver + Safari (Mac and iPhone), and record what you find as issues.

For each of Sign in / Sign up, Overview, Candidates, Applications, Jobs, Settings:

1. Landmarks and headings: you can jump by region and by heading, and the order makes sense.
2. Every control has a name, a role and a state read aloud (tabs, switches, dropdowns, disclosures).
3. Forms: labels, hints and errors are read; an error moves focus or is announced.
4. Lists shown as cards on phones (People, Candidates, Connections, Employers): each card reads as a list item, each value is tied to its label.
5. The welcome dialog and tour: focus enters, is trapped, and returns; Escape works; each tour stop is announced.
6. Toasts: a saved or failed message is announced once.
7. Charts have a text alternative with the same facts.
8. Everything works with the keyboard alone, at 200% zoom, with increased text spacing and with reduced motion.
