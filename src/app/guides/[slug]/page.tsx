import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingFooter } from "@/components/marketing/footer";
import { buttonVariants } from "@/components/ui/button";
import { GUIDES, getGuide } from "@/lib/guides";
import { siteUrl } from "@/lib/site";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  return {
    title: `${guide.title} · Network Growth`,
    description: guide.summary,
    ...(siteUrl() ? { alternates: { canonical: `/guides/${guide.slug}` } } : {}),
  };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: guide.title,
    description: guide.summary,
    step: guide.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.heading, text: s.body })),
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-[max(1rem,env(safe-area-inset-left))] py-10">
        <Link href="/guides" className="text-sm text-muted-foreground underline underline-offset-4">← All guides</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance">{guide.title}</h1>
        <p className="mt-2 text-muted-foreground">{guide.summary}</p>
        <ol className="mt-8 grid gap-5">
          {guide.steps.map((s, i) => (
            <li key={s.heading} className="grid grid-cols-[auto_1fr] gap-3">
              <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">{i + 1}</span>
              <div>
                <h2 className="font-semibold">{s.heading}</h2>
                <p className="text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href={guide.next.href} className={`${buttonVariants()} mt-8`}>{guide.next.label}</Link>
      </main>
      <MarketingFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\u003c") }} />
    </div>
  );
}
