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
            Sign in with your email. This app never asks for your LinkedIn password.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Suspense fallback={<LoginForm />}>
            <LoginBody searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function LoginBody({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <>
      {params.error === "link" ? (
        <p className="text-sm text-destructive" role="alert">
          That sign-in link is invalid or has expired. Request a new one.
        </p>
      ) : null}
      <LoginForm next={next} />
    </>
  );
}
