import { Suspense } from "react";
import { PageNav } from "@/components/page-nav";
import { Disclosure } from "@/components/disclosure";
import { PageSkeleton } from "@/components/page-skeleton";
import { ExternalLink } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { addKnownConnection, deleteAllKnownConnections, deleteKnownConnection, updateKnownConnection } from "./actions";
import { ConnectionsImport } from "./connections-import";

export const metadata = { title: "Connections · Network Growth" };

const PAGE_SIZE = 50;

export default function ConnectionsPage({ searchParams }: PageProps<"/connections">) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Known connections</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          The people you&apos;re already connected with. Discover uses this private list to leave them out of research results. It&apos;s
          only what you import or type here: the app never reads your LinkedIn network.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import a connections file</CardTitle>
          <CardDescription>
            On LinkedIn: Settings → Data privacy → Get a copy of your data → Connections. Upload the Connections.csv from the download. You see what
            will change before anything is saved, and importing the same file twice is safe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionsImport />
        </CardContent>
      </Card>

      <Disclosure summary="Add one connection by hand">
            <ActionForm action={addKnownConnection} submitLabel="Add" resetOnSuccess>
              <ConnectionFields />
            </ActionForm>
      </Disclosure>

      <Suspense fallback={<PageSkeleton label="Loading connections…" />}>
        <ConnectionList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function ConnectionFields({ values, idPrefix = "new" }: { values?: { fullName: string; company: string | null; position: string | null; linkedinUrl: string | null }; idPrefix?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input id={`${idPrefix}-name`} name="fullName" required maxLength={200} defaultValue={values?.fullName} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-company`}>Company</Label>
        <Input id={`${idPrefix}-company`} name="company" maxLength={200} defaultValue={values?.company ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-position`}>Position</Label>
        <Input id={`${idPrefix}-position`} name="position" maxLength={300} defaultValue={values?.position ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-url`}>LinkedIn URL (optional)</Label>
        <Input id={`${idPrefix}-url`} name="linkedinUrl" maxLength={500} defaultValue={values?.linkedinUrl ?? ""} placeholder="linkedin.com/in/…" />
      </div>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function ConnectionList({ searchParams }: Pick<PageProps<"/connections">, "searchParams">) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const page = Math.max(1, Number(one(params.page)) || 1);
  const supabase = await createClient();
  let query = supabase
    .from("known_connections")
    .select("id, full_name, company, position, linkedin_url, connected_on, source", { count: "exact" })
    .order("full_name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const term = q.replace(/[,()*%\\"':.]/g, " ").trim();
  if (term) query = query.or(["full_name", "company", "position"].map((c) => `${c}.ilike.*${term}*`).join(","));
  const { data, count, error } = await query;
  if (error) return <LoadError what="connections" />;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/connections?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <section aria-labelledby="known-heading" className="grid gap-3">
      <h2 id="known-heading" className="text-base font-semibold">
        Your list
      </h2>
      <form role="search" className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Name, company, position" />
        </div>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total.toLocaleString("en-CA")} known connection{total === 1 ? "" : "s"}
        {total > PAGE_SIZE ? ` · page ${page} of ${pages}` : ""}
      </p>

      {data.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          {q ? "No connections match." : "No known connections yet. Import your Connections.csv so Discover can skip people you already know."}
        </p>
      ) : (
        <Table stack>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Company · position</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="max-w-48 truncate font-medium">
                  {k.full_name}
                  {k.linkedin_url ? (
                    <a href={k.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${k.full_name} on LinkedIn`} title={`Open ${k.full_name} on LinkedIn`} className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground">
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </TableCell>
                <TableCell label="Company · position" className="hidden max-w-72 truncate whitespace-normal text-muted-foreground sm:table-cell">
                  {[k.company, k.position].filter(Boolean).join(" · ")}
                </TableCell>
                <TableCell label="Source" className="hidden text-muted-foreground md:table-cell">{k.source === "linkedin_export" ? "LinkedIn export" : k.source === "csv" ? "CSV" : "Added by hand"}</TableCell>
                <TableCell className="text-right">
                  <details className="inline-block text-left">
                    <summary className={buttonVariants({ variant: "ghost", size: "sm" })}>Edit</summary>
                    <div className="mt-2 grid w-[min(90vw,32rem)] gap-3 rounded-lg border bg-background p-3">
                      <ActionForm action={updateKnownConnection} submitLabel="Save" size="sm">
                        <input type="hidden" name="id" value={k.id} />
                        <ConnectionFields idPrefix={k.id} values={{ fullName: k.full_name, company: k.company, position: k.position, linkedinUrl: k.linkedin_url }} />
                      </ActionForm>
                      <ActionForm action={deleteKnownConnection} submitLabel="Delete" variant="destructive" size="sm">
                        <input type="hidden" name="id" value={k.id} />
                      </ActionForm>
                    </div>
                  </details>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <PageNav current={page} pages={pages} href={href} />

      {total > 0 ? (
        <Disclosure summary="Delete all known connections">
          <div className="grid gap-2">
            <p className="text-muted-foreground">Removes the whole imported list from this app. People you saved from research are kept.</p>
            <ActionForm action={deleteAllKnownConnections} submitLabel="Delete all" variant="destructive" size="sm">
              <Label htmlFor="confirmDelete">Type DELETE to confirm</Label>
              <Input id="confirmDelete" name="confirm" autoComplete="off" className="max-w-40" />
            </ActionForm>
          </div>
        </Disclosure>
      ) : null}
    </section>
  );
}
