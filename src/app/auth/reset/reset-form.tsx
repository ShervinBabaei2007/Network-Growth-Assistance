"use client";

import { useActionState } from "react";
import { updatePassword, type PasswordState } from "@/app/auth/actions";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-rules";
import { useT } from "@/lib/i18n/client";

export function ResetForm() {
  const t = useT();
  const [state, action, pending] = useActionState<PasswordState, FormData>(updatePassword, { status: "idle" });
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="password">{t("auth.newPassword")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </div>
      {state.status === "error" ? <FormError>{state.message}</FormError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("auth.saving") : t("auth.savePassword")}
      </Button>
    </form>
  );
}
