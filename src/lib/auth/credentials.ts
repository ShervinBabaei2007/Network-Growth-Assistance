import { z } from "zod";

import { MIN_PASSWORD_LENGTH } from "./password-rules";

const email = z.email("Enter a valid email address.");
const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(72, "Use 72 characters or fewer.");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z
  .object({ email, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
