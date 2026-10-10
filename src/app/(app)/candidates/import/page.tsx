import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { localDate } from "@/lib/dates";
import { CsvImport } from "./csv-import";
import { ExportImport } from "./export-import";

export const metadata = { title: "Import · Network Growth" };

export default function ImportPage() {
  return (
    <div className="grid gap-6">
      <Link href="/candidates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Candidates
      </Link>
      <h1 className="text-xl font-semibold">Import</h1>

      <Card>
        <CardHeader>
          <CardTitle>LinkedIn data export</CardTitle>
          <CardDescription>
            LinkedIn&apos;s official copy of your data: Settings → Data privacy → Get a copy of
            your data → Connections and Invitations. It updates acceptances, records invitations you
            sent without logging, and refreshes your network total. Email addresses in the file are
            ignored and never stored. You see what will change before anything is saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <ExportImportForUser />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidate list (CSV)</CardTitle>
          <CardDescription>
            Lists you put together yourself: a spreadsheet of profiles from LinkedIn search, a club
            roster, or event attendees who shared their profiles. You see a preview before anything
            is saved, and profiles already in your list are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImport />
        </CardContent>
      </Card>
    </div>
  );
}

async function ExportImportForUser() {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("timezone").single();
  return <ExportImport today={localDate(new Date(), data?.timezone ?? "America/Vancouver")} />;
}
