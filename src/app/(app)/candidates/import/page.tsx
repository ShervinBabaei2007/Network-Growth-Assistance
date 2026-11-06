import { Tx } from "@/components/tx";
import { LocaleScope } from "@/components/locale-scope";
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
        <ArrowLeft className="size-4" aria-hidden /> <Tx k="pages.candidates.title" />
      </Link>
      <h1 className="text-xl font-semibold"><Tx k="importPage.title" /></h1>

      <Card>
        <CardHeader>
          <CardTitle><Tx k="importPage.exportTitle" /></CardTitle>
          <CardDescription>
            <Tx k="importPage.exportDesc" />
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
          <CardTitle><Tx k="importPage.csvTitle" /></CardTitle>
          <CardDescription>
            <Tx k="importPage.csvDesc" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <LocaleScope groups={["msg", "ui"]}>
              <CsvImport />
            </LocaleScope>
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function ExportImportForUser() {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("timezone").single();
  return (
    <LocaleScope groups={["msg", "ui"]}>
      <ExportImport today={localDate(new Date(), data?.timezone ?? "UTC")} />
    </LocaleScope>
  );
}
