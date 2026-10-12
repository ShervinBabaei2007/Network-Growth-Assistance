/**
 * Fictional fixture data (sample employers, canned AI answers, invented people) exists for
 * tests and local demos only. It is switched on by JOBS_FIXTURES=1 / DISCOVERY_FIXTURES=1,
 * and never in a production build or a production deployment, whatever the flags say.
 */

type Env = Record<string, string | undefined>;

export function isProductionRuntime(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

let warned = false;

function enabled(flag: string | undefined, env: Env): boolean {
  if (flag !== "1") return false;
  if (isProductionRuntime(env)) {
    if (!warned) {
      warned = true;
      console.error("Fixture mode was requested in production and has been ignored. Unset JOBS_FIXTURES and DISCOVERY_FIXTURES.");
    }
    return false;
  }
  return true;
}

export const jobFixturesEnabled = (env: Env = process.env) => enabled(env.JOBS_FIXTURES, env);
export const discoveryFixturesEnabled = (env: Env = process.env) => enabled(env.DISCOVERY_FIXTURES, env);
