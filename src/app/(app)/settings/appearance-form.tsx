"use client";

import { useState } from "react";
import { saveAppearance } from "@/app/(app)/actions";
import { writeAppearanceCookie } from "@/components/appearance-sync";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ACCENTS, applyAppearance, CONTRASTS, DENSITIES, TEXT_SIZES, THEMES, type Appearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  comfortable: "Comfortable",
  compact: "Compact",
  normal: "Normal",
  large: "Large",
  standard: "Standard",
  high: "High contrast",
  blue: "Blue",
  teal: "Teal",
  green: "Green",
  violet: "Violet",
  rose: "Rose",
};

/** The colour shown on each accent's swatch: the same hue as its light-theme primary token in globals.css. */
const SWATCH: Record<(typeof ACCENTS)[number], string> = {
  blue: "oklch(0.52 0.16 257)",
  teal: "oklch(0.5 0.12 195)",
  green: "oklch(0.5 0.12 155)",
  violet: "oklch(0.5 0.12 295)",
  rose: "oklch(0.5 0.12 10)",
};

type Key = keyof Appearance;
const GROUPS: { key: Key; legend: string; hint: string; options: readonly string[] }[] = [
  { key: "theme", legend: "Theme", hint: "System follows your device's light or dark setting.", options: THEMES },
  { key: "contrast", legend: "Contrast", hint: "High contrast uses pure black and white with strong borders. It works with light and dark.", options: CONTRASTS },
  { key: "density", legend: "Density", hint: "Compact fits more on the screen.", options: DENSITIES },
  { key: "text", legend: "Text size", hint: "Large makes all text and controls bigger.", options: TEXT_SIZES },
];

const ITEM = "data-pressed:bg-primary data-pressed:text-primary-foreground data-pressed:hover:bg-primary/90";

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
  // A single-choice group reports an empty list when the pressed item is pressed again: keep the current choice.
  const pick = (key: Key) => (v: string[]) => {
    const chosen = v[0];
    if (chosen && chosen !== value[key]) change({ ...value, [key]: chosen } as Appearance);
  };

  return (
    <div className="grid gap-5">
      {GROUPS.map((g) => (
        <fieldset key={g.key} className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{g.legend}</legend>
          <ToggleGroup variant="outline" value={[value[g.key]]} onValueChange={pick(g.key)} aria-label={g.legend} className="flex-wrap">
            {g.options.map((o) => (
              <ToggleGroupItem key={o} value={o} className={ITEM}>
                {LABELS[o]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">{g.hint}</p>
        </fieldset>
      ))}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Accent colour</legend>
        <ToggleGroup variant="outline" value={[value.accent]} onValueChange={pick("accent")} aria-label="Accent colour" className="flex-wrap">
          {ACCENTS.map((a) => (
            <ToggleGroupItem key={a} value={a} className={ITEM}>
              <span aria-hidden className="size-3.5 rounded-full border border-background/60" style={{ background: SWATCH[a] }} />
              {LABELS[a]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">Used for buttons, links and the focus ring. Every colour is checked for readable contrast in light and dark.</p>
      </fieldset>

      <Preview appearance={value} />
    </div>
  );
}

/** A small sample of the real components, so the effect of a choice is visible beside the control that made it. */
function Preview({ appearance }: { appearance: Appearance }) {
  return (
    <Card size="sm" data-testid="appearance-preview" aria-label="Preview of your appearance choices" className={cn("max-w-md")}>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          {LABELS[appearance.theme]} theme, {LABELS[appearance.accent].toLowerCase()} accent, {appearance.contrast === "high" ? "high contrast" : "standard contrast"}, {LABELS[appearance.density].toLowerCase()} spacing, {LABELS[appearance.text].toLowerCase()} text.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="preview-field">Sample field</Label>
          <Input id="preview-field" placeholder="Type here to try the focus ring" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="button">
            Primary action
          </Button>
          <Button size="sm" type="button" variant="outline">
            Secondary
          </Button>
          <Badge>New</Badge>
          <Badge variant="outline">Saved</Badge>
          <a href="#preview-field" className="text-sm text-primary underline underline-offset-4">
            A link
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
