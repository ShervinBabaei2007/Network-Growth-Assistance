export type PageTourStep = {
  id: string;
  href: string;
  selector: string;
  title: string;
  body: string;
  /** How long to wait for the target before moving on. Pages that load live results need longer. */
  waitMs?: number;
};

/** Longer than the Jobs page's own provider budget, so a slow live search doesn't skip its stops. */
const SLOW_PAGE_WAIT_MS = 15000;

/**
 * The guided tour: one stop per part of the app. Each stop opens its page and points at something
 * real on it. Pages without a single obvious control point at their one <h1> ("main h1").
 */
export const TOUR_STEPS: PageTourStep[] = [
  { id: "overview", href: "/overview", selector: "[data-tour=primary-action]", title: "Overview: your next step", body: "This page always recommends one thing to do next. When you're not sure where to start, come back here." },
  { id: "breakdown", href: "/overview", selector: "[data-tour=breakdown]", title: "Overview: the details", body: "Pipeline, activity and progress per discipline. It stays folded until you have something to show." },
  { id: "discover", href: "/discover", selector: "main h1", title: "Discover: find people", body: "Describe who you'd like to meet. It searches public sources and shows only matches it can back up with a quote." },
  { id: "jobs-search", href: "/jobs", selector: "[data-tour=jobs-search]", waitMs: SLOW_PAGE_WAIT_MS, title: "Jobs: search", body: "Search real, recent postings by title and place. Saved searches can alert you when something new appears." },
  { id: "jobs-fit", href: "/jobs", selector: "[data-tour=jobs-tabs]", waitMs: SLOW_PAGE_WAIT_MS, title: "Jobs: sorted by fit", body: "Once your resume is in, jobs are sorted into Good fit, Stretch and Doesn't qualify, with the reason for each." },
  { id: "resume", href: "/jobs/resume", selector: "main h1", title: "Your resume", body: "Import your resume once. It's used to score jobs and to tailor a resume or cover letter for a posting." },
  { id: "queue", href: "/queue", selector: "main h1", title: "Daily Queue", body: "The approved people to invite today, in order. Open each profile, send the invitation yourself, then mark it sent." },
  { id: "candidates", href: "/candidates", selector: "main h1", title: "Candidates", body: "LinkedIn results you paste in, tracked from review to invitation to acceptance. Accepted candidates count toward your targets." },
  { id: "people", href: "/people", selector: "main h1", title: "People", body: "Your personal list of people worth meeting, with status, notes and reminders. Discover results you save end up here." },
  { id: "connections", href: "/connections", selector: "main h1", title: "Known connections", body: "Import the people you already know so Discover doesn't suggest them again. The app never reads your LinkedIn network." },
  { id: "applications", href: "/applications", selector: "main h1", title: "Applications", body: "Track each job from saved to offer, with reminders and interviews. Nothing moves on its own." },
  { id: "analytics", href: "/analytics", selector: "main h1", title: "Analytics", body: "Charts of your activity and progress over time, plus a table by discipline and school." },
  { id: "disciplines", href: "/disciplines", selector: "main h1", title: "Disciplines", body: "Progress toward the target for each field you chose to connect with." },
  { id: "schools", href: "/universities", selector: "main h1", title: "Schools", body: "The same progress, by school. Add or change your schools in Settings." },
  { id: "notifications", href: "/notifications", selector: "main h1", title: "Notifications", body: "Reminders, interviews and new-job alerts collect here. The bell in the top bar shows how many are unread." },
  { id: "settings", href: "/settings", selector: "main h1", title: "Settings", body: "Your goal, schools and disciplines, notifications, appearance and your data. Outreach can be paused here." },
  { id: "help", href: "/help", selector: "main h1", title: "Help", body: "Replay this tour or restart the setup guide any time, and see which page is for what." },
  { id: "done", href: "/overview", selector: "main h1", title: "That's the tour", body: "Back on Overview, your Getting Started checklist has the first steps. You can skip anything and come back later." },
];

/** The stop for a page, so a resumed tour can pick up where the user already is. */
export function stepIndexFor(pathname: string): number {
  const i = TOUR_STEPS.findIndex((s) => s.href === pathname);
  return i === -1 ? 0 : i;
}
