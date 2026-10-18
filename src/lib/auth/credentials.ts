import { z } from "zod";

import { MIN_PASSWORD_LENGTH } from "./password-rules";

// Messages are translation keys (see src/lib/i18n); the server actions translate them for the person.
const email = z.email("errors.invalidEmail");
const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "errors.passwordTooShort")
  .max(72, "errors.passwordTooLong");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "errors.enterPassword"),
});

export const signUpSchema = z
  .object({ email, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "errors.passwordsDontMatch" });

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "errors.passwordsDontMatch" });
