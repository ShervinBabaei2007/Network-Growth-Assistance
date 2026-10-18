import { describe, expect, it } from "vitest";
import { googleUrlHasClient } from "./google";

describe("googleUrlHasClient", () => {
  it("accepts a real Google address", () => {
    expect(googleUrlHasClient("https://accounts.google.com/o/oauth2/v2/auth?client_id=123-abc.apps.googleusercontent.com&scope=email")).toBe(true);
  });
  it("rejects an unfilled placeholder or a missing id", () => {
    expect(googleUrlHasClient("https://accounts.google.com/o/oauth2/v2/auth?client_id=env%28GOOGLE_CLIENT_ID%29")).toBe(false);
    expect(googleUrlHasClient("https://accounts.google.com/o/oauth2/v2/auth?client_id=")).toBe(false);
    expect(googleUrlHasClient("https://accounts.google.com/o/oauth2/v2/auth")).toBe(false);
    expect(googleUrlHasClient("not a url")).toBe(false);
  });
});
