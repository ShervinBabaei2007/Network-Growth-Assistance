import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketingFooter } from "@/components/marketing/footer";
import { FAQ, GUIDES } from "@/lib/guides";
import { canonicalFor, siteUrl } from "@/lib/site";

export const metadata = {
  title: "Network Growth Assistant · Plan your networking and job search",
  description:
    "Set a networking plan, track invitations against targets and keep your job applications in one place. It never scrapes LinkedIn or asks for your password.",
  ...canonicalFor("/"),
};

const SHOWCASE = [
  { src: "/showcase/overview.png", title: "A plan with real targets", text: "Set your goal, schools and fields. Progress counts accepted connections only, and every number says where it came from.", alt: "The overview page showing progress toward a connection goal" },
  { src: "/showcase/applications.png", title: "Every application on one board", text: "Move roles from saved to offer, with interviews, reminders and the resume you used.", alt: "The applications board with roles in stages" },
  { src: "/showcase/discover.png", title: "Find people worth meeting", text: "Describe who you would like to meet and get matches you can check, with the evidence shown.", alt: "The discover page listing people with evidence" },
  { src: "/showcase/analytics.png", title: "See what is working", text: "Charts of your network growth and outreach, built from your own records.", alt: "The analytics page with network growth charts" },
] as const;

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
      <header className="flex items-center justify-between gap-2 border-b px-[max(1rem,env(safe-area-inset-left))] py-3">
        <p className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="size-2.5 rounded-full bg-primary" />
          Network Growth
        </p>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link href="/guides" className={buttonVariants({ variant: "ghost", size: "sm" })}>Guides</Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</Link>
          <Link href="/login?mode=signup" className={buttonVariants({ size: "sm" })}>Sign up</Link>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-10 md:py-16">
        <section className="grid gap-4 text-center md:justify-items-center">
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">Grow your network on purpose. Keep your job search organized.</h1>
          <p className="max-w-2xl text-lg text-muted-foreground text-balance">
            Set a plan, track who you have invited and who accepted, and follow every application from saved to offer, in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/login?mode=signup" className={buttonVariants({ size: "lg" })}>Create a free account</Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>Sign in</Link>
          </div>
          <p className="text-sm text-muted-foreground">New here? Choose “Look around with example data” after signing up to see it full.</p>
        </section>

        <section aria-labelledby="promise" className="mt-14">
          <h2 id="promise" className="text-xl font-semibold">Built on promises it keeps</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              ["Never scrapes LinkedIn", "No passwords, no cookies, no automation. You paste, import or open things yourself."],
              ["Nothing invented", "Scores come from rules on your data. AI writes text, and it is checked."],
              ["You send every message", "The app drafts and copies. It never sends on your behalf."],
              ["Honest numbers", "Pending invitations never count toward a target, and every number says where it came from."],
            ].map(([title, text]) => (
              <li key={title}>
                <Card size="sm" className="h-full">
                  <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{text}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="features" className="mt-14 grid gap-10">
          <h2 id="features" className="text-xl font-semibold">What you can do</h2>
          {SHOWCASE.map((item, i) => (
            <article key={item.src} className="grid items-center gap-4 md:grid-cols-2 md:gap-8">
              <div className={i % 2 ? "md:order-2" : undefined}>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-1 text-muted-foreground">{item.text}</p>
              </div>
              <Image src={item.src} alt={item.alt} width={1280} height={800} sizes="(min-width: 768px) 480px, 100vw" loading="lazy" className="w-full rounded-lg border" />
            </article>
          ))}
        </section>

        <section aria-labelledby="guides" className="mt-14">
          <h2 id="guides" className="text-xl font-semibold">Guides</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`} className="block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <Card size="sm" className="h-full hover:bg-muted/50">
                    <CardHeader>
                      <CardTitle>{g.title}</CardTitle>
                      <CardDescription>{g.summary}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="faq" className="mt-14">
          <h2 id="faq" className="text-xl font-semibold">Questions</h2>
          <dl className="mt-4 grid gap-4">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt className="font-medium">{f.q}</dt>
                <dd className="text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <MarketingFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
