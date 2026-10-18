"use client";

import { Copy, Download, Save } from "lucide-react";
import { savePrepSnapshot } from "./actions";
import { toast } from "@/components/toast/notify";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { packToMarkdown, type PrepPack } from "@/lib/interview-prep/prep";

/** Copy the pack as Markdown, download it, or save a copy to the application's timeline. */
export function PrepExport({ applicationId, pack, fileName }: { applicationId: string; pack: PrepPack; fileName: string }) {
  const { pending, run } = useActionRunner();
  const markdown = () => packToMarkdown(pack);

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown());
      toast.success("Copied. Paste it into your notes.");
    } catch {
      toast.error("Couldn't copy. Use Download instead.");
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
        <Copy aria-hidden /> Copy as Markdown
      </Button>
      <Button size="sm" variant="outline" onClick={download}>
        <Download aria-hidden /> Download
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => savePrepSnapshot(applicationId, pack))}>
        <Save aria-hidden /> Save to timeline
      </Button>
    </div>
  );
}
