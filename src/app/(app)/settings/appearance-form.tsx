"use client";

import { useState } from "react";
import { saveAppearance } from "@/app/(app)/actions";
import { writeAppearanceCookie } from "@/components/appearance-sync";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { applyAppearance, DENSITIES, TEXT_SIZES, THEMES, type Appearance } from "@/lib/appearance";

const LABELS: Record<string, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  comfortable: "Comfortable",
  compact: "Compact",
  normal: "Normal",
  large: "Large",
};

const GROUPS = [
  { key: "theme", legend: "Theme", hint: "System follows your device's light or dark setting.", options: THEMES },
  { key: "density", legend: "Density", hint: "Compact fits more on the screen.", options: DENSITIES },
  { key: "text", legend: "Text size", hint: "Large makes all text and controls bigger.", options: TEXT_SIZES },
] as const;

/** Changes apply at once on this device and are saved for your other devices, with Undo. */
export function AppearanceForm({ initial }: { initial: Appearance }) {
  const [value, setValue] = useState(initial);
  const { run } = useActionRunner();
  const apply = (a: Appearance) => {
    setValue(a);
    applyAppearance(a, window.matchMedia("(prefers-color-scheme: dark)").matches);
    writeAppearanceCookie(a);
  };
  const change = (next: Appearance) => {
    const before = value;
    apply(next);
    run(() => saveAppearance(next), {
      quiet: true,
      undo: async () => {
        apply(before);
        return saveAppearance(before);
      },
    });
  };
  return (
    <div className="grid gap-5">
      {GROUPS.map((g) => (
        <fieldset key={g.key} className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{g.legend}</legend>
          <div className="flex flex-wrap gap-2">
            {g.options.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                <input
                  type="radio"
                  name={g.key}
                  value={o}
                  className="accent-primary"
                  checked={value[g.key] === o}
                  onChange={() => change({ ...value, [g.key]: o })}
                />
                {LABELS[o]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{g.hint}</p>
        </fieldset>
      ))}
    </div>
  );
}
