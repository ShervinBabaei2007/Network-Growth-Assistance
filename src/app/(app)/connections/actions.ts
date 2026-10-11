"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { CONNECTION_FIELDS, parseConnections, type ColumnMapping } from "@/lib/connections/csv";
import { applyConnectionImport, planImport } from "@/lib/connections/import";
import { ManualConnectionSource } from "@/lib/connections/source";
import { failed, firstIssue, saved, type FormState } from "@/lib/form-state";
import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { actionContext, logActivity } from "@/lib/server/action-context";
import { normalizeName, splitName } from "@/lib/text/names";

const MAX_BYTES = 4_000_000;

export type ConnectionImportState = {
  status: "idle" | "preview" | "imported" | "error";
  message?: string;
  header?: string[];
  sample?: string[][];
  mapping?: ColumnMapping;
  isLinkedInExport?: boolean;
  counts?: { rows: number; add: number; update: number; unchanged: number; skipped: number; duplicatesInFile: number };
  failures?: number;
};

function mappingFrom(formData: FormData): Partial<ColumnMapping> | undefined {
  if (formData.get("customMapping") !== "1") return undefined;
  const out: Partial<ColumnMapping> = {};
  for (const f of CONNECTION_FIELDS) {
    const v = Number(formData.get(`map_${f}`));
    out[f] = Number.isInteger(v) && v >= 0 ? v : -1;
  }
  return out;
}

/**
 * Preview (mode=preview) or import (mode=import) a connections CSV. The file is
 * parsed in memory and never stored; email addresses are never saved.
 */
export async function importConnections(_: ConnectionImportState, formData: FormData): Promise<ConnectionImportState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose a CSV file." };
  if (file.size > MAX_BYTES) return { status: "error", message: "The file is larger than 4 MB." };

  const parsed = parseConnections(await file.text(), mappingFrom(formData));
  if (parsed.error) return { status: "error", message: parsed.error, header: parsed.header, mapping: parsed.mapping, sample: parsed.sample };

  const ctx = await actionContext();
  const plan = await planImport(ctx.supabase, parsed.rows);
  const view = {
    header: parsed.header,
    sample: parsed.sample,
    mapping: parsed.mapping,
    isLinkedInExport: parsed.isLinkedInExport,
    counts: { rows: parsed.rows.length, add: plan.insert.length, update: plan.update.length, unchanged: plan.unchanged, skipped: parsed.skipped, duplicatesInFile: parsed.duplicatesInFile },
  };
  if (formData.get("mode") !== "import") return { status: "preview", ...view };

  const failures = await applyConnectionImport(ctx.supabase, ctx.userId, plan, parsed.isLinkedInExport ? "linkedin_export" : "csv");
  await logActivity(ctx, "connections.imported", { added: plan.insert.length, updated: plan.update.length, failures });
  refresh();
  const total = plan.insert.length + plan.update.length + plan.unchanged;
  return {
    status: "imported",
    ...view,
    failures,
    message: failures
      ? `Imported, but ${failures} row${failures === 1 ? "" : "s"} couldn't be saved. Importing the same file again is safe.`
      : `${total.toLocaleString("en-CA")} known connection${total === 1 ? "" : "s"} imported (${plan.insert.length.toLocaleString("en-CA")} new).`,
  };
}

const personFields = {
  fullName: z.string().trim().min(1, "Enter a name.").max(200),
  company: z.string().trim().max(200).transform((s) => s || null),
  position: z.string().trim().max(300).transform((s) => s || null),
  linkedinUrl: z.string().trim().max(500).transform((s) => s || null),
};

export async function addKnownConnection(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object(personFields).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  if (parsed.data.linkedinUrl) {
    const url = normalizeProfileUrl(parsed.data.linkedinUrl);
    if (!url.ok) return failed(url.reason);
  }
  const [row] = await new ManualConnectionSource(parsed.data).importConnections();
  if (!row) return failed("Enter a name.");
  const ctx = await actionContext();
  const plan = await planImport(ctx.supabase, [row]);
  if (!plan.insert.length && !plan.update.length) return failed("This connection is already in your list.");
  const failures = await applyConnectionImport(ctx.supabase, ctx.userId, plan, "manual");
  if (failures) return failed("Couldn't save. Try again.");
  await logActivity(ctx, "connections.added", {});
  refresh();
  return saved(plan.insert.length ? "Added." : "Updated the existing record.");
}

export async function updateKnownConnection(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ id: z.uuid(), ...personFields }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const d = parsed.data;
  const url = d.linkedinUrl ? normalizeProfileUrl(d.linkedinUrl) : null;
  if (url && !url.ok) return failed(url.reason);
  const normalized = normalizeName(d.fullName);
  if (!normalized) return failed("Enter a name.");
  const split = splitName(d.fullName);
  const ctx = await actionContext();
  const { error } = await ctx.supabase
    .from("known_connections")
    .update({
      full_name: d.fullName,
      first_name: split.first,
      last_name: split.last,
      normalized_name: normalized,
      company: d.company,
      position: d.position,
      linkedin_url: url?.ok ? url.url : null,
      linkedin_key: url?.ok ? url.key : null,
    })
    .eq("id", d.id);
  if (error) return failed(error.code === "23505" ? "Another connection already has that LinkedIn link." : "Couldn't save. Try again.");
  refresh();
  return saved();
}

export async function deleteKnownConnection(_: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return failed("Unknown connection.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("known_connections").delete().eq("id", id.data);
  if (error) return failed("Couldn't delete. Try again.");
  refresh();
  return saved("Deleted.");
}

/** Removes every imported connection. People found by research are kept. */
export async function deleteAllKnownConnections(_: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirm") !== "DELETE") return failed("Type DELETE to confirm.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("known_connections").delete().eq("user_id", ctx.userId);
  if (error) return failed("Couldn't delete. Try again.");
  await logActivity(ctx, "connections.deleted_all", {});
  refresh();
  return saved("All known connections deleted.");
}
