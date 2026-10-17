"use server";

import { refresh } from "next/cache";
import { loadCatalog } from "@/lib/data/catalog";
import { classifyCandidate } from "@/lib/classify";
import { applyConnectionImport, planImport } from "@/lib/connections/import";
import { normalizeName, splitName } from "@/lib/text/names";
import { localDate, localDateTimeToInstant } from "@/lib/dates";
import {
  parseConnectionsCsv,
  parseInvitationsCsv,
  planExportImport,
  type ExportConnection,
  type KnownCandidate,
} from "@/lib/imports/linkedin-export";
import { actionContext, logActivity } from "@/lib/server/action-context";

const MAX_BYTES = 3_500_000;

export type ExportSummary = {
  totalConnections: number | null;
  invitationsToRecord: number;
  acceptancesToRecord: number;
  connectedNew: number;
  connectedPreexisting: number;
  newFromTargetSchools: number;
  newOther: number;
  pendingMissingFromExport: number;
  incomingIgnored: number;
  /** Rows of Connections.csv that will be added to (or update) your known 1st-degree connections. */
  knownConnectionsToSave: number;
};

export type ExportState = {
  status: "idle" | "preview" | "imported" | "error";
  message?: string;
  summary?: ExportSummary;
  failures?: number;
};

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() ? v : null;
};

/** Text of an uploaded file field, or null when no file was chosen. */
async function fileText(formData: FormData, name: string): Promise<string | null> {
  const f = formData.get(name);
  if (!(f instanceof File) || f.size === 0) return null;
  return f.text();
}

/** Preview (mode=preview) or apply (mode=import) LinkedIn's official data export. */
export async function importLinkedInExport(_: ExportState, formData: FormData): Promise<ExportState> {
  const connectionsText = await fileText(formData, "connections");
  const invitationsText = await fileText(formData, "invitations");
  if (!connectionsText && !invitationsText) return { status: "error", message: "Choose Connections.csv, Invitations.csv or both." };
  if ((connectionsText?.length ?? 0) + (invitationsText?.length ?? 0) > MAX_BYTES) return { status: "error", message: "The files are larger than 3.5 MB together." };

  const connections = connectionsText ? parseConnectionsCsv(connectionsText) : null;
  if (connections?.error) return { status: "error", message: connections.error };
  const invitations = invitationsText ? parseInvitationsCsv(invitationsText) : null;
  if (invitations?.error) return { status: "error", message: invitations.error };

  const ctx = await actionContext();
  const tz = ctx.settings.timezone;
  const today = localDate(new Date(), tz);
  const exportDate = field(formData, "exportDate") ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exportDate) || exportDate > today) return { status: "error", message: "The export date can't be in the future." };

  // Look up every profile in the files that is already a candidate.
  const keys = [...new Set([...(connections?.rows ?? []), ...(invitations?.rows ?? [])].map((r) => r.key))];
  const known = new Map<string, KnownCandidate>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await ctx.supabase
      .from("candidates")
      .select("id, profile_key, status, invitations(outcome)")
      .in("profile_key", keys.slice(i, i + 200));
    if (error) return { status: "error", message: "Couldn't read your candidates. Try again." };
    for (const c of data) {
      const inv = c.invitations[0];
      known.set(c.profile_key, { id: c.id, status: c.status, invitation: !inv ? "none" : inv.outcome === "pending" ? "pending" : "resolved" });
    }
  }
  // Pending invitations not in the files still matter for "missing from export".
  if (invitations) {
    const { data } = await ctx.supabase.from("invitations").select("candidates(id, profile_key, status)").eq("outcome", "pending").limit(5000);
    for (const r of data ?? []) {
      if (!known.has(r.candidates.profile_key)) known.set(r.candidates.profile_key, { id: r.candidates.id, status: r.candidates.status, invitation: "pending" });
    }
  }

  const plan = planExportImport({
    connections: connections?.rows ?? null,
    connectionsSkipped: connections?.skipped ?? 0,
    invitations: invitations?.rows ?? null,
    known,
    projectStartDate: ctx.settings.project_start_date,
  });

  // New connections are only worth tracking as candidates if they're at one of the user's schools.
  const catalog = await loadCatalog(ctx.supabase);
  const classify = (c: ExportConnection) => classifyCandidate(c.company, c.position, catalog);
  const targetSchool = plan.newConnections.filter((c) => classify(c).university.value !== null);

  const summary: ExportSummary = {
    totalConnections: plan.totalConnections,
    invitationsToRecord: plan.recordSent.length,
    acceptancesToRecord: plan.resolveAccepted.length,
    connectedNew: plan.markConnected.filter((m) => !m.preexisting).length,
    connectedPreexisting: plan.markConnected.filter((m) => m.preexisting).length,
    newFromTargetSchools: targetSchool.length,
    newOther: plan.newConnections.length - targetSchool.length,
    pendingMissingFromExport: plan.pendingMissingFromExport,
    incomingIgnored: invitations?.incoming ?? 0,
    knownConnectionsToSave: 0,
  };
  // The same file also fills your known 1st-degree connections, used to skip people you know in Discover.
  const knownPlan = connections
    ? await planImport(
        ctx.supabase,
        connections.rows.map((c) => {
          const split = splitName(c.fullName);
          return {
            fullName: c.fullName,
            firstName: split.first,
            lastName: split.last,
            normalizedName: normalizeName(c.fullName) || c.key,
            company: c.company || null,
            position: c.position || null,
            linkedinUrl: c.url,
            linkedinKey: c.key,
            connectedOn: c.connectedOn,
          };
        }),
      )
    : null;
  summary.knownConnectionsToSave = knownPlan ? knownPlan.insert.length + knownPlan.update.length : 0;
  if (formData.get("mode") !== "import") return { status: "preview", summary };

  const noon = (date: string | null) => localDateTimeToInstant(`${date ?? exportDate}T12:00`, tz).toISOString();
  let failures = 0;

  for (const s of plan.recordSent) {
    const { error } = await ctx.supabase.rpc("record_invitation_sent", {
      p_candidate_id: s.candidateId,
      p_sent_at: s.sentAtLocal ? localDateTimeToInstant(s.sentAtLocal, tz).toISOString() : noon(null),
      p_note_text: s.message || undefined,
      p_source: "linkedin_export",
    });
    if (error) failures++;
  }
  for (const r of plan.resolveAccepted) {
    const { error } = await ctx.supabase.rpc("resolve_invitation", { p_candidate_id: r.candidateId, p_outcome: "accepted", p_resolved_at: noon(r.connectedOn) });
    if (error) failures++;
  }
  for (const m of plan.markConnected) {
    const { error } = await ctx.supabase
      .from("candidates")
      .update({ status: "connected", connected_at: noon(m.connectedOn), connected_via: "export", is_preexisting_connection: m.preexisting })
      .eq("id", m.candidateId)
      .is("connected_via", null);
    if (error) failures++;
  }
  if (formData.get("addNew") === "on" && targetSchool.length > 0) {
    const rows = targetSchool.map((c) => {
      const r = classify(c);
      return {
        user_id: ctx.userId,
        full_name: c.fullName,
        profile_url: c.url,
        profile_key: c.key,
        raw_school_text: c.company || null,
        raw_program_text: c.position || null,
        university: r.university.value,
        discipline: r.discipline.value,
        university_confidence: r.university.confidence,
        discipline_confidence: r.discipline.confidence,
        source: "linkedin_export" as const,
        status: "connected" as const,
        connected_at: noon(c.connectedOn),
        connected_via: "export" as const,
      };
    });
    const { error } = await ctx.supabase.from("candidates").upsert(rows, { onConflict: "user_id,profile_key", ignoreDuplicates: true });
    if (error) failures += rows.length;
  }
  if (plan.totalConnections !== null) {
    const recordedAt = exportDate === today ? new Date().toISOString() : noon(exportDate);
    // Re-importing the same file shouldn't add a duplicate point to the history.
    const { data: same } = await ctx.supabase
      .from("connection_snapshots")
      .select("id")
      .eq("source", "linkedin_export")
      .eq("total_connections", plan.totalConnections)
      .gte("recorded_at", localDateTimeToInstant(`${exportDate}T00:00`, tz).toISOString())
      .lt("recorded_at", localDateTimeToInstant(`${exportDate}T23:59`, tz).toISOString())
      .limit(1);
    const { error } = same?.length ? { error: null } : await ctx.supabase.from("connection_snapshots").insert({
      user_id: ctx.userId,
      total_connections: plan.totalConnections,
      recorded_at: recordedAt,
      source: "linkedin_export",
    });
    if (error) failures++;
  }

  if (knownPlan) failures += await applyConnectionImport(ctx.supabase, ctx.userId, knownPlan, "linkedin_export");

  await logActivity(ctx, "import.linkedin_export", { ...summary, failures });
  refresh();
  return {
    status: "imported",
    summary,
    failures,
    message: failures ? `Imported, but ${failures} change${failures === 1 ? "" : "s"} couldn't be applied. Re-running is safe.` : "Export imported.",
  };
}
