import { Term } from "@/components/term";
import { recordSnapshot, setBaseline } from "@/app/(app)/actions";
import { ActionForm } from "@/components/action-form";
import { LocaleScope } from "@/components/locale-scope";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getT } from "@/lib/i18n/server";

export async function BaselineForm({ today }: { today: string }) {
  const t = await getT();
  return (
    <LocaleScope groups={["ui"]}>
      <ActionForm action={setBaseline} submitLabel={t("overview.saveStartingCount")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="baseline">{t("overview.baselineLabel")}</Label>
            <Input id="baseline" name="baseline" type="number" min={0} max={30000} inputMode="numeric" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="startDate">{t("overview.startDateLabel")}</Label>
            <Input id="startDate" name="startDate" type="date" max={today} defaultValue={today} required />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("overview.baselineHelpLead")} <Term term="baseline">{t("overview.baselineTerm")}</Term>. {t("overview.baselineHelp")}
        </p>
      </ActionForm>
    </LocaleScope>
  );
}

export async function SnapshotForm({ today }: { today: string }) {
  const t = await getT();
  return (
    <LocaleScope groups={["ui"]}>
      <ActionForm action={recordSnapshot} submitLabel={t("overview.recordCount")} variant="outline">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="total">{t("overview.totalNow")}</Label>
            <Input id="total" name="total" type="number" min={0} max={30000} inputMode="numeric" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="date">{t("overview.asOf")}</Label>
            <Input id="date" name="date" type="date" max={today} defaultValue={today} required />
          </div>
        </div>
      </ActionForm>
    </LocaleScope>
  );
}
