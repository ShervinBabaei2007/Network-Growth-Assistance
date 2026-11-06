import { ActionForm } from "@/components/action-form";
import { Checkbox } from "@/components/ui/checkbox";
import { AppSelect } from "@/components/app-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEGREE_LABELS } from "@/lib/domain";
import { addCandidate } from "./actions";
import { getT } from "@/lib/i18n/server";
import { LocaleScope } from "@/components/locale-scope";

export async function QuickAddForm() {
  const t = await getT();
  return (
    <LocaleScope groups={["ui"]}>
    <ActionForm action={addCandidate} submitLabel={t("candidatesPage.addCandidate")} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="profileUrl">{t("candidatesPage.profileUrl")}</Label>
          <Input id="profileUrl" name="profileUrl" placeholder="https://www.linkedin.com/in/…" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fullName">{t("candidatesPage.fullName")}</Label>
          <Input id="fullName" name="fullName" required maxLength={200} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="role">{t("candidatesPage.roleHeadline")}</Label>
          <Input id="role" name="role" maxLength={300} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="schoolText">{t("candidatesPage.schoolText")}</Label>
          <Input id="schoolText" name="schoolText" maxLength={300} placeholder={t("candidatesPage.asShown")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="programText">{t("candidatesPage.programText")}</Label>
          <Input id="programText" name="programText" maxLength={300} placeholder={t("candidatesPage.asShown")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="degreeLevel">{t("candidatesPage.degreeLevel")}</Label>
          <AppSelect id="degreeLevel" name="degreeLevel" defaultValue="">
            <option value="">{t("candidatesPage.unknown")}</option>
            {Object.entries(DEGREE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </AppSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gradYear">{t("candidatesPage.gradYear")}</Label>
          <Input id="gradYear" name="gradYear" type="number" min={1950} max={2100} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">{t("candidatesPage.notes")}</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            maxLength={2000}
            placeholder={t("candidatesPage.notesPlaceholder")}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="approve" />
        {t("candidatesPage.approveNow")}
      </label>
      <p className="text-xs text-muted-foreground">
        {t("candidatesPage.copyNote")}
      </p>
    </ActionForm>
    </LocaleScope>
  );
}
