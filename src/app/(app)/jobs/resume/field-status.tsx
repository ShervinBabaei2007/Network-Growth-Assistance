"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FieldMeta } from "@/lib/job-postings/types";
import { cn } from "@/lib/utils";

export const fieldAnchor = (path: string) => `field-${path.replace(/\./g, "-")}`;

/**
 * One profile field with what the parser thinks of it. A field that needs review gets a
 * warning icon, an amber border, a "Needs review" badge and the reason, and stays marked
 * until the user changes it or says it's right. A field that wasn't found says so.
 */
export function FieldShell({
  path,
  label,
  inputId,
  meta,
  edited,
  onUse,
  onConfirm,
  confirming,
  children,
  className,
}: {
  path: string;
  label: string;
  inputId: string;
  meta: FieldMeta | undefined;
  /** The user changed it in this session: it no longer shows as uncertain. */
  edited: boolean;
  onUse?: (value: string) => void;
  onConfirm?: () => void;
  confirming?: boolean;
  children: (props: { "aria-describedby"?: string; "aria-invalid"?: boolean; className?: string }) => ReactNode;
  className?: string;
}) {
  const review = Boolean(meta?.needsReview) && !edited;
  const missing = Boolean(meta?.missing) && !edited;
  const helpId = `${inputId}-help`;
  const showHelp = review || missing;
  return (
    <div id={fieldAnchor(path)} data-needs-review={review || undefined} className={cn("grid scroll-mt-24 gap-1.5", review && "rounded-lg border border-warning/60 bg-warning-soft/40 p-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Label htmlFor={inputId}>{label}</Label>
        {review ? (
          <>
            <AlertTriangle aria-hidden className="size-3.5 text-warning" />
            <Badge variant="outline" className="h-5 border-warning/60 px-1.5 text-[11px] text-warning" title={meta?.sourceText ? `Read from your resume: “${meta.sourceText}”` : undefined}>
              Needs review
            </Badge>
          </>
        ) : null}
      </div>
      {children({
        "aria-describedby": showHelp ? helpId : undefined,
        "aria-invalid": review || undefined,
        className: review ? "border-warning/70 focus-visible:border-warning focus-visible:ring-warning/30" : undefined,
      })}
      {showHelp ? (
        <p id={helpId} className={cn("text-xs", review ? "text-foreground" : "text-muted-foreground")}>
          {meta?.reason ?? (missing ? "Not found in your resume." : "Please check this field.")}
          {review && meta?.sourceText ? <span className="text-muted-foreground"> Read from: “{meta.sourceText.slice(0, 120)}”.</span> : null}
        </p>
      ) : null}
      {review && (meta?.alternatives?.length || onConfirm) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {meta?.alternatives?.slice(0, 4).map((alt) =>
            onUse ? (
              <Button key={alt} type="button" size="xs" variant="outline" onClick={() => onUse(alt)}>
                Use “{alt.length > 40 ? `${alt.slice(0, 40)}…` : alt}”
              </Button>
            ) : null,
          )}
          {onConfirm ? (
            <Button type="button" size="xs" variant="ghost" disabled={confirming} onClick={onConfirm}>
              <Check aria-hidden /> Looks right
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
