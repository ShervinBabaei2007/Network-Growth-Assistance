import "server-only";
import nodemailer from "nodemailer";
import { serverEnv } from "@/lib/env";

export type Mail = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> };
export type Mailer = { enabled: true; send(mail: Mail): Promise<void> } | { enabled: false; reason: string };

/** Email is sent only when SMTP, the app's address and the unsubscribe secret are all set. */
export function emailConfig() {
  const env = serverEnv();
  if (!env.SMTP_HOST || !env.SMTP_FROM || !env.APP_URL || !env.EMAIL_TOKEN_SECRET) return null;
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
    appUrl: env.APP_URL.replace(/\/$/, ""),
    secret: env.EMAIL_TOKEN_SECRET,
  };
}

export const emailConfigured = () => emailConfig() !== null;

export function getMailer(): Mailer {
  const config = emailConfig();
  if (!config) return { enabled: false, reason: "Email isn't set up on this server." };
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Port 465 is TLS from the start; others upgrade with STARTTLS when the server offers it.
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    enabled: true,
    async send(mail) {
      await transport.sendMail({ from: config.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers });
    },
  };
}
