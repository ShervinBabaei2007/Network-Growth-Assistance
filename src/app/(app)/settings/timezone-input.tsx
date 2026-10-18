"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Every time zone the browser knows; read only when the field is first used. */
function zones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

/**
 * A time-zone field with suggestions. The ~400 suggestions are built on first focus rather than sent
 * with the page, so they aren't part of what the browser has to hydrate on load.
 */
export function TimeZoneInput({ id, defaultValue }: { id: string; defaultValue: string }) {
  const [options, setOptions] = useState<string[] | null>(null);
  const listId = `${id}-list`;
  return (
    <>
      <Input id={id} name="timezone" list={listId} defaultValue={defaultValue} required onFocus={() => setOptions((cur) => cur ?? zones())} />
      <datalist id={listId}>
        {(options ?? []).map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
    </>
  );
}
