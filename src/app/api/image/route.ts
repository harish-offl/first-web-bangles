import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const ALLOWED_REMOTE_HOSTS = [".supabase.co", "res.cloudinary.com"];
const ALLOWED_REMOTE_HOSTS_EXACT = new Set(["res.cloudinary.com"]);

function isAllowedRemote(hostname: string): boolean {
  return (
    ALLOWED_REMOTE_HOSTS_EXACT.has(hostname) ||
    ALLOWED_REMOTE_HOSTS.some(
      (suffix) => suffix.startsWith(".") && hostname.endsWith(suffix),
    )
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseDimension(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? clamp(parsed, 16, 2400) : fallback;
}

function parseQuality(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? clamp(parsed, 30, 90) : 75;
}

async function loadSource(source: string): Promise<Buffer | null> {
  if (source.startsWith("/")) {
    if (source.startsWith("/api/image")) return null;
    const cleaned = decodeURIComponent(source.split("?")[0].split("#")[0]).replace(/^\/+/, "");
    const filePath = path.resolve(PUBLIC_DIR, cleaned);
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
      return null;
    }
    try {
      return await readFile(filePath);
    } catch {
      return null;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol) || !isAllowedRemote(parsed.hostname)) {
    return null;
  }

  const response = await fetch(parsed.href, {
    headers: { Accept: "image/*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;
  return Buffer.from(await response.arrayBuffer());
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) {
    return NextResponse.json({ error: "Missing image url." }, { status: 400 });
  }

  const width = parseDimension(request.nextUrl.searchParams.get("w"), 640);
  const quality = parseQuality(request.nextUrl.searchParams.get("q"));

  let input: Buffer | null;
  try {
    input = await loadSource(source);
  } catch {
    input = null;
  }
  if (!input) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  try {
    const output = await sharp(input, { failOn: "none", animated: false })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Vercel-CDN-Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image could not be processed." }, { status: 422 });
  }
}
