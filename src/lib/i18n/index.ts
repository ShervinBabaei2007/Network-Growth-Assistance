import { translatorFor, translateWith, type Locale, type MessageKey, type Messages, type Params, type Translator } from "./core";
import { en } from "./messages/en";
import { frCA } from "./messages/fr-CA";

/**
 * A small, typed translation layer. The English file defines every key; the French file must have exactly the
 * same keys (TypeScript refuses to compile otherwise, and a test checks that every {placeholder} is kept).
 * No library and no JSON. This file holds the messages, so only server code and tests import it; the browser
 * imports ./core and receives the messages for the one language in use as props.
 */

export * from "./core";

export const MESSAGES: Record<Locale, Messages> = { en, "fr-CA": frCA };

/** Falls back to English for a key missing from the chosen language, then to the key itself. */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return translateWith(MESSAGES[locale], key, params, en);
}

export const translator = (locale: Locale): Translator => translatorFor(MESSAGES[locale], en);
