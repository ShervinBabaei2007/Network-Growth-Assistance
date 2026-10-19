"use client";

import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  requestPasswordReset,
  resendConfirmation,
  sendMagicLink,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  type PasswordState,
  type ResendState,
  type SignInState,
} from "@/app/auth/actions";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-rules";
import { useT } from "@/lib/i18n/client";

type Mode = "signin" | "signup";

/** Opens on the Sign up tab for /login?mode=signup; read on the client so the page itself stays static. */
export function LoginFormWithMode() {
  const mode = useSearchParams().get("mode");
  return <LoginForm initialMode={mode === "signup" ? "signup" : "signin"} />;
}

type Method = "password" | "link" | "forgot";

export function LoginForm({ initialMode = "signin" }: { initialMode?: Mode }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [method, setMethod] = useState<Method>("password");

  return (
    <div className="grid gap-4">
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value as Mode);
          setMethod("password");
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
          <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <form action={signInWithGoogle}>
        <Button type="submit" variant="outline" className="w-full">
          <GoogleIcon />
          {t("auth.continueWithGoogle")}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      {mode === "signup" ? (
        <SignUpForm />
      ) : method === "link" ? (
        <MagicLinkForm onBack={() => setMethod("password")} />
      ) : method === "forgot" ? (
        <ForgotForm onBack={() => setMethod("password")} />
      ) : (
        <SignInForm onForgot={() => setMethod("forgot")} onLink={() => setMethod("link")} />
      )}
    </div>
  );
}

function EmailField() {
  const t = useT();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="email">{t("auth.email")}</Label>
      <Input id="email" name="email" type="email" autoComplete="email" required />
    </div>
  );
}

function PasswordField({ id = "password", label, mode }: { id?: string; label: string; mode: "current" | "new" }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="password"
        autoComplete={mode === "new" ? "new-password" : "current-password"}
        minLength={mode === "new" ? MIN_PASSWORD_LENGTH : undefined}
        required
      />
    </div>
  );
}

function SignInForm({ onForgot, onLink }: { onForgot: () => void; onLink: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState<PasswordState, FormData>(signInWithPassword, { status: "idle" });
  return (
    <form action={action} className="grid gap-3">
      <EmailField />
      <PasswordField label={t("auth.password")} mode="current" />
      {state.status === "error" ? <FormError>{state.message}</FormError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <button type="button" onClick={onForgot} className="text-muted-foreground underline underline-offset-4">
          {t("auth.forgotPassword")}
        </button>
        <button type="button" onClick={onLink} className="text-muted-foreground underline underline-offset-4">
          {t("auth.emailMeLink")}
        </button>
      </div>
    </form>
  );
}

function SignUpForm() {
  // Remounting with a new key clears the form state, for "Use a different email".
  const [attempt, setAttempt] = useState(0);
  return <SignUpAttempt key={attempt} onRestart={() => setAttempt((n) => n + 1)} />;
}

function SignUpAttempt({ onRestart }: { onRestart: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState<PasswordState, FormData>(signUpWithPassword, { status: "idle" });
  if (state.status === "confirm") {
    return <ConfirmPending email={state.email} onRestart={onRestart} />;
  }
  return (
    <form action={action} className="grid gap-3">
      <EmailField />
      <PasswordField label={t("auth.password")} mode="new" />
      <PasswordField id="confirm" label={t("auth.confirmPassword")} mode="new" />
      <p className="text-xs text-muted-foreground">{t("auth.useAtLeast", { count: MIN_PASSWORD_LENGTH })}</p>
      {state.status === "error" ? <FormError>{state.message}</FormError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("auth.creatingAccount") : t("auth.createAccount")}
      </Button>
    </form>
  );
}

/** Hosted Supabase allows one confirmation email per address every 60 seconds by default. */
const RESEND_COOLDOWN_SECONDS = 60;

function ConfirmPending({ email, onRestart }: { email?: string; onRestart: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState<ResendState, FormData>(resendConfirmation, { status: "idle" });
  // The first email was just sent, so the countdown starts right away and restarts after each resend.
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "sent") setSecondsLeft(RESEND_COOLDOWN_SECONDS);
  }

  useEffect(() => {
    if (secondsLeft === 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return (
    <div className="grid gap-3">
      <p className="text-sm" role="status">
        {t("auth.checkInboxConfirm")}
      </p>
      {email ? (
        <p className="text-sm">
          {t("auth.confirmSentTo", { email })}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("auth.checkSpam")}</p>
      {email ? (
        <form action={action} className="grid gap-3">
          <input type="hidden" name="email" value={email} />
          <Button type="submit" variant="outline" disabled={pending || secondsLeft > 0}>
            {pending ? t("auth.sending") : secondsLeft > 0 ? t("auth.resendIn", { seconds: secondsLeft }) : t("auth.resendEmail")}
          </Button>
          <div aria-live="polite">
            {state.status === "sent" ? <p className="text-sm">{t("auth.resent")}</p> : null}
            {state.status === "error" ? <FormError>{state.message}</FormError> : null}
          </div>
        </form>
      ) : null}
      <button type="button" onClick={onRestart} className="text-xs text-muted-foreground underline underline-offset-4">
        {t("auth.useDifferentEmail")}
      </button>
    </div>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState<PasswordState, FormData>(requestPasswordReset, { status: "idle" });
  if (state.status === "reset-sent") {
    return (
      <p className="text-sm" role="status">
        {t("auth.resetSent")}
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <EmailField />
      {state.status === "error" ? <FormError>{state.message}</FormError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("auth.sending") : t("auth.sendResetLink")}
      </Button>
      <BackLink onClick={onBack} />
    </form>
  );
}

function MagicLinkForm({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState<SignInState, FormData>(sendMagicLink, { status: "idle" });
  if (state.status === "sent") {
    return (
      <p className="text-sm" role="status">
        {t("auth.checkInboxLink")}
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <EmailField />
      {state.status === "error" ? <FormError>{state.message}</FormError> : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("auth.sending") : t("auth.emailMeLinkButton")}
      </Button>
      <BackLink onClick={onBack} />
    </form>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} className="text-xs text-muted-foreground underline underline-offset-4">
      {t("auth.backToPassword")}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.100A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.400a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.100z" />
      <path fill="#EA4335" d="M12 4.800c1.8 0 3.300.6 4.600 1.800l3.400-3.400A12 12 0 0 0 1.4 6.7l4 3.100C6.3 6.9 8.9 4.8 12 4.800z" />
    </svg>
  );
}
