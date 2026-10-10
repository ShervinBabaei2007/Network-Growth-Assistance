import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CsvImport } from "./csv-import";

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
