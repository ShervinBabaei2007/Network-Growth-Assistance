import { ImageResponse } from "next/og";

const SIZES = [180, 192, 512];

/**
 * The app icon at the sizes a home screen asks for. `maskable=1` keeps the mark inside the centre 60% so a phone can
 * crop it to a circle or rounded square. Drawn here instead of stored as files, so there is one source for the design.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const asked = Number(params.get("size"));
  const size = SIZES.includes(asked) ? asked : 512;
  const maskable = params.get("maskable") === "1";
  const mark = Math.round(size * (maskable ? 0.3 : 0.42));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#2a78d6" }}>
        <div style={{ width: mark, height: mark, borderRadius: "50%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: Math.round(mark * 0.4), height: Math.round(mark * 0.4), borderRadius: "50%", background: "#2a78d6" }} />
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
