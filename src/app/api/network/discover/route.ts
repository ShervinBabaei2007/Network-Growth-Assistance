import { after, NextResponse } from "next/server";
import { z } from "zod";
import { advanceSearch } from "@/lib/discovery/agent";
import { discoveryAi } from "@/lib/discovery/ai-access";
import { NetworkingCriteria } from "@/lib/discovery/criteria";
import { discoveryServices } from "@/lib/discovery/providers/registry";
import { startSearch } from "@/lib/discovery/service";
import { isUuid, routeUser, unauthorized } from "@/lib/server/route-auth";

// Each research step is bounded to fit within this, including the Vercel Hobby limit.
export const maxDuration = 60;

const Body = z.object({
  query: z.string().max(1000),
  criteria: NetworkingCriteria.nullish(),
  parentSearchId: z.string().refine(isUuid).nullish(),
});

/** Starts a research job. The first step runs right after the response; the page polls for the rest. */
export async function POST(request: Request) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe who you'd like to meet." }, { status: 400 });

  const started = await startSearch(user.supabase, user.userId, parsed.data);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });

  after(async () => {
    const ai = await discoveryAi(user.supabase, started.id);
    await advanceSearch(user.supabase, user.userId, started.id, discoveryServices(ai.llm)).catch(() => undefined);
  });
  return NextResponse.json({ id: started.id }, { status: 201 });
}
