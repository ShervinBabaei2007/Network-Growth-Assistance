import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">That page or record doesn&apos;t exist, or it isn&apos;t in your workspace.</p>
      <Link href="/overview" className="text-sm underline underline-offset-4">
        Back to the overview
      </Link>
    </main>
  );
}
