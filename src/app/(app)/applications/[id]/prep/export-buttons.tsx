"use client";

import { Copy, Download, Save } from "lucide-react";
import { savePrepSnapshot } from "./actions";
import { toast } from "@/components/toast/notify";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import type { PrepPack } from "@/lib/interview-prep/prep";
import { useTr } from "@/lib/i18n/client";

/** Copy the pack as Markdown, download it, or save a copy to the application's timeline. */
export function PrepExport({ applicationId, pack, markdown: markdownText, fileName }: { applicationId: string; pack: PrepPack; markdown: string; fileName: string }) {
  const { pending, run } = useActionRunner();
  const tr = useTr();
  const markdown = () => markdownText;

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown());
      toast.success(tr("prepPage.copied", "Copied. Paste it into your notes."));
    } catch {
      toast.error(tr("prepPage.copyFailed", "Couldn't copy. Use Download instead."));
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([markdown()], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => void copy()}>
        <Copy aria-hidden /> {tr("prepPage.copyMd", "Copy as Markdown")}
      </Button>
      <Button size="sm" variant="outline" onClick={download}>
        <Download aria-hidden /> {tr("prepPage.download", "Download")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => savePrepSnapshot(applicationId, pack))}>
        <Save aria-hidden /> {tr("prepPage.saveTimeline", "Save to timeline")}
      </Button>
    </div>
  );
}
