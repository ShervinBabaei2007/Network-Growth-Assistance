import Image from "next/image";
import Link from "next/link";
import { Disclosure } from "@/components/disclosure";
import { MarketingFooter } from "@/components/marketing/footer";
import { buttonVariants } from "@/components/ui/button";
import { FAQ } from "@/lib/guides";
import { canonicalFor, siteUrl } from "@/lib/site";

export const metadata = {
  title: "Network Growth Assistant · Plan your networking and job search",
  description:
    "Set a networking plan, track invitations against targets and keep your job applications in one place. It never scrapes LinkedIn or asks for your password.",
  ...canonicalFor("/"),
};

// One column, one idea at a time: what it is, what it does, what it never does, then a single next step.
const STEPS = [
  ["Set a plan", "Choose your goal, the schools and fields you want to reach, and a target for each."],
  ["Track who says yes", "Record invitations and acceptances. Only accepted connections count toward your goal."],
  ["Keep your job search in one list", "Move every application from saved to offer, with interviews and reminders."],
] as const;

const NEVER = ["Scrape LinkedIn or ask for your password", "Invent scores or facts", "Send a message for you"] as const;

export default function LandingPage() {
  const site = siteUrl();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Network Growth Assistant",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: metadata.description,
      offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
      ...(site ? { url: site.toString() } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-[max(1rem,env(safe-area-inset-left))] py-3">
        <p className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="size-2.5 rounded-full bg-primary" />
          Network Growth
        </p>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</Link>
          <Link href="/login?mode=signup" className={buttonVariants({ size: "sm" })}>Sign up</Link>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-[max(1rem,env(safe-area-inset-left))] pt-12 pb-20 md:pt-20">
        <section className="grid justify-items-center gap-5 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">Grow your network on purpose. Keep your job search organized.</h1>
          <p className="max-w-xl text-lg text-muted-foreground text-balance">One place to plan your networking and follow every application.</p>
          <Link href="/login?mode=signup" className={buttonVariants({ size: "lg" })}>Create a free account</Link>
        </section>

        <Image
          src="/showcase/overview.png"
          alt="The overview page showing progress toward a connection goal"
          width={1280}
          height={800}
          sizes="(min-width: 672px) 640px, 100vw"
          priority
          className="mt-14 w-full rounded-xl border shadow-sm"
        />

        <section aria-labelledby="how" className="mt-24">
          <h2 id="how" className="text-center text-2xl font-semibold">How it works</h2>
          <ol className="mt-8 grid gap-8">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="grid grid-cols-[auto_1fr] gap-4">
                <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <div>
                  <h3 className="text-lg font-medium">{title}</h3>
                  <p className="mt-1 text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="never" className="mt-24 text-center">
          <h2 id="never" className="text-2xl font-semibold">What it never does</h2>
          <ul className="mx-auto mt-6 grid max-w-md gap-2 text-left">
            {NEVER.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="text-muted-foreground">✕</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted-foreground">Never scrapes LinkedIn. You paste, import or open everything yourself.</p>
        </section>

        <section aria-labelledby="start" className="mt-24 grid justify-items-center gap-4 text-center">
          <h2 id="start" className="text-2xl font-semibold">Ready to start?</h2>
          <Link href="/login?mode=signup" className={buttonVariants({ size: "lg" })}>Create a free account</Link>
          <p className="max-w-md text-sm text-muted-foreground">After signing up, choose “Look around with example data” to see it full first.</p>
        </section>

        <section aria-labelledby="faq" className="mt-24">
          <h2 id="faq" className="text-center text-2xl font-semibold">Questions</h2>
          <div className="mt-6 grid gap-2">
            {FAQ.map((f) => (
              <Disclosure key={f.q} summary={f.q}>
                <p className="text-muted-foreground">{f.a}</p>
              </Disclosure>
            ))}
          </div>
        </section>
      </main>

      <MarketingFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
