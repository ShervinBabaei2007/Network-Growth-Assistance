/**
 * The public how-to guides. Plain data so the pages are static and easy to review: each guide is a short
 * introduction and numbered steps. Nothing here asks for a LinkedIn password or automates LinkedIn.
 */

export type Guide = {
  slug: "export-linkedin-connections" | "build-a-networking-plan" | "track-job-applications";
  title: string;
  summary: string;
  steps: { heading: string; body: string }[];
  next: { label: string; href: string };
};

export const GUIDES: Guide[] = [
  {
    slug: "export-linkedin-connections",
    title: "How to export your LinkedIn connections",
    summary: "Download a copy of your own connections from LinkedIn so you can see who you already know, without giving anyone your password.",
    steps: [
      { heading: "Open your LinkedIn settings", body: "On LinkedIn, click your profile picture, then Settings & Privacy." },
      { heading: "Go to Data privacy", body: "Choose Data privacy, then Get a copy of your data." },
      { heading: "Pick Connections", body: "Select Connections only, then request the archive. LinkedIn emails you a link when it is ready; this can take a few minutes." },
      { heading: "Download the file", body: "Open the email, download the zip and unzip it. The file you want is called Connections.csv." },
      { heading: "Import it into Network Growth", body: "In Connections, choose Import and select the file. You see exactly what will change before anything is saved." },
    ],
    next: { label: "Create an account", href: "/login?mode=signup" },
  },
  {
    slug: "build-a-networking-plan",
    title: "How to build a networking plan",
    summary: "A simple plan has a goal, the schools and fields you want to reach, and a target for each. Here is how to set one up.",
    steps: [
      { heading: "Choose one goal", body: "Pick a number you can explain, such as 500 new connections by the end of the term. A smaller goal you keep is better than a large one you drop." },
      { heading: "List the schools and fields", body: "Write down the schools, colleges or companies you want to meet people from, and the disciplines or roles you care about. You can add the other ways each is written, such as UBC and University of British Columbia." },
      { heading: "Set a target for each", body: "Give every field a total and, if you like, a share for each school. Pending invitations never count toward a target; only accepted connections do." },
      { heading: "Record where you are today", body: "Enter your current connection count so progress is measured from your real starting point." },
      { heading: "Work in small daily batches", body: "Use the daily queue to review a few people, write a short note and send the invitation yourself. The app never sends anything for you." },
    ],
    next: { label: "Start a plan", href: "/login?mode=signup" },
  },
  {
    slug: "track-job-applications",
    title: "How to track job applications",
    summary: "Keep every role in one list, from saved to offer, with the dates and notes that make follow-ups easy.",
    steps: [
      { heading: "Save roles as you find them", body: "Add a role from a job board or paste a posting. Each one starts as Saved with the company, title and link." },
      { heading: "Move it through the stages", body: "When you apply, move it to Applied. Then Screening, Interviewing and Offer as things happen, or Rejected, Withdrawn or No response when they end." },
      { heading: "Add interviews and reminders", body: "Put interview times and follow-up reminders on the application so nothing slips." },
      { heading: "Keep the documents with the role", body: "Attach the resume version you used so you know exactly what each employer saw." },
      { heading: "Review what is waiting on you", body: "Check the board weekly: roles with no reply after a few weeks are a good prompt to follow up or close." },
    ],
    next: { label: "Track your first role", href: "/login?mode=signup" },
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export const FAQ: { q: string; a: string }[] = [
  { q: "Does it scrape LinkedIn or ask for my password?", a: "No. It never asks for your LinkedIn password or cookies, never scrapes LinkedIn and never sends messages for you. Anything from LinkedIn comes from what you paste, import or open yourself." },
  { q: "Who sends the invitations and messages?", a: "You do. The app drafts a short note and copies it; you send it on LinkedIn." },
  { q: "Are the scores and matches made up?", a: "No. Scores come from clear rules on your own data. AI only helps write text, and what it writes is checked." },
  { q: "Does a pending invitation count toward my goal?", a: "No. Only accepted connections count, and every number says where it came from." },
  { q: "Can I try it without entering my own data?", a: "Yes. Create an account and choose Look around with example data. One click removes the examples." },
  { q: "Can I delete my data?", a: "Yes. You can download everything you have stored and delete your account from Settings." },
];
