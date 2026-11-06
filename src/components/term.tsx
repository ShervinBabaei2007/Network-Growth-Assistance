import { TermPopover } from "@/components/term-popover";
import { getT } from "@/lib/i18n/server";

export type GlossaryTerm = "pending" | "confirmed" | "needsReview" | "baseline";

/**
 * A status word with its plain-language meaning one tap (or Enter / Space) away. The definition lives in the
 * messages, so it follows the language. `children` overrides the visible word when the sentence needs another form.
 */
export async function Term({ term, children }: { term: GlossaryTerm; children?: React.ReactNode }) {
  const t = await getT();
  const label = t(`glossary.${term}.label`);
  return (
    <TermPopover label={label} definition={t(`glossary.${term}.definition`)} ariaLabel={t("glossary.explain", { term: label })}>
      {children}
    </TermPopover>
  );
}
