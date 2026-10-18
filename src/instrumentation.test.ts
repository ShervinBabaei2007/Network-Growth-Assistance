import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

describe("onRequestError", () => {
  beforeEach(() => {
    rpc.mockClear();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
  });

  it("records a scrubbed server error under the route pattern", async () => {
    const { onRequestError } = await import("./instrumentation");
    const err = Object.assign(new Error("Failed for maya.chen@example.com on /candidates/3f2c1a9e-0000-4000-8000-000000000000"), { digest: "abc123" });
    await onRequestError(err, { path: "/candidates/3f2c1a9e-0000-4000-8000-000000000000?q=secret", method: "GET", headers: {} }, { routerKind: "App Router", routePath: "/candidates/[id]", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined, renderType: "dynamic" });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0]!;
    expect(name).toBe("record_client_error");
    expect(args).toMatchObject({ p_source: "server", p_route: "/candidates/[id]", p_digest: "abc123" });
    expect(JSON.stringify(args)).not.toMatch(/maya|example\.com|3f2c1a9e|secret/);
  });

  it("never throws, even if reporting fails", async () => {
    rpc.mockRejectedValueOnce(new Error("db down"));
    const { onRequestError } = await import("./instrumentation");
    await expect(onRequestError(new Error("x"), { path: "/", method: "GET", headers: {} }, { routerKind: "App Router", routePath: "/", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined, renderType: "dynamic" })).resolves.toBeUndefined();
  });
});
