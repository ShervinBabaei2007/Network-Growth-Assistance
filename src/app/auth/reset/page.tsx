import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password · Network Growth", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>You&apos;re signed in from the reset link. Pick a password you&apos;ll remember.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetForm />
        </CardContent>
      </Card>
    </main>
  );
}
