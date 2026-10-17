import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Network Growth" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Network Growth Assistant</CardTitle>
          <CardDescription>
            Sign in with Google or your email. This app never asks for your LinkedIn password.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Suspense fallback={null}>
            <LinkError searchParams={searchParams} />
          </Suspense>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}

// Only the error notice depends on the URL, so the form itself is part of the static
// shell and works the moment it appears. The action reads `next` from the Referer.
async function LinkError({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  if (params.error === "google") {
    return (
      <p className="text-sm text-destructive" role="alert">
        Google sign-in isn&apos;t available right now. Use the email link instead.
      </p>
    );
  }
  if (params.error !== "link") return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      That sign-in link is invalid or has expired. Request a new one.
    </p>
  );
}
