import { describe, expect, it } from "vitest";
import { storageAlert, storageStatus } from "./storage";

const mb = (n: number) => ({ database_bytes: n * 1024 * 1024 });

describe("storage status", () => {
  it("is fine below 70% of the limit", () => {
    expect(storageStatus(mb(340), 500).level).toBe("ok");
    expect(storageAlert(storageStatus(mb(340), 500), new Date())).toBeNull();
  });

  it("warns from 70% and is critical from 90%", () => {
    expect(storageStatus(mb(350), 500).level).toBe("warning");
    expect(storageStatus(mb(449), 500).level).toBe("warning");
    expect(storageStatus(mb(450), 500).level).toBe("critical");
  });

  it("raises an alert when usage crosses the line, once a month per level", () => {
    const status = storageStatus(mb(360), 500);
    const alert = storageAlert(status, new Date("2026-10-18T00:00:00Z"));
    expect(alert?.title).toBe("Database is 72% of its limit");
    expect(alert?.dedupe).toBe("storage:warning:2026-10");
    expect(storageAlert(status, new Date("2026-10-30T00:00:00Z"))?.dedupe).toBe(alert?.dedupe);
    expect(storageAlert(status, new Date("2026-11-02T00:00:00Z"))?.dedupe).toBe("storage:warning:2026-11");
  });
});
