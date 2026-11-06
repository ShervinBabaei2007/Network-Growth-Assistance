import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { translator, type MessageKey, type Params } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";

/**
 * Text in the person's language for server components. The language is read per request, so the text sits in its own
 * Suspense boundary: the English shows at once and the person's language replaces it as soon as it is known.
 * Use it for headings, descriptions and labels that are not already inside a component that knows the language.
 */
export function Tx({ k, params }: { k: MessageKey; params?: Params }) {
  return (
    <Suspense fallback={translator("en")(k, params)}>
      <Localized k={k} params={params} />
    </Suspense>
  );
}

async function Localized({ k, params }: { k: MessageKey; params?: Params }) {
  return (await getT())(k, params);
}

type HeaderProps = {
  title: MessageKey;
  description?: MessageKey;
  back?: { href: string; label: MessageKey };
  actions?: ReactNode;
  meta?: ReactNode;
};

/** PageHeader with a translated title, description and breadcrumb. */
export function PageHeaderT(props: HeaderProps) {
  return (
    <Suspense fallback={<Header {...props} t={translator("en")} />}>
      <LocalizedHeader {...props} />
    </Suspense>
  );
}

async function LocalizedHeader(props: HeaderProps) {
  return <Header {...props} t={await getT()} />;
}

function Header({ title, description, back, actions, meta, t }: HeaderProps & { t: ReturnType<typeof translator> }) {
  return <PageHeader title={t(title)} description={description ? t(description) : undefined} back={back ? { href: back.href, label: t(back.label) } : undefined} actions={actions} meta={meta} />;
}
