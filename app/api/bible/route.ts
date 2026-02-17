import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache — passages don't change, so cache aggressively
const cache = new Map<
  string,
  {
    reference: string;
    verses: Array<{ verse: number; text: string }>;
    text: string;
    translation: string;
    fetchedAt: number;
  }
>();

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference");

  if (!reference) {
    return NextResponse.json({ error: "reference parameter is required" }, { status: 400 });
  }

  const cacheKey = reference.toLowerCase().replace(/\s+/g, " ").trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached);
  }

  try {
    const url = `https://bible-api.com/${encodeURIComponent(reference)}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Bible text. Check the reference format." },
        { status: 502 },
      );
    }

    const data = await res.json();

    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 404 });
    }

    const verses = (data.verses ?? []).map(
      (v: { verse: number; text: string }) => ({
        verse: v.verse,
        text: (v.text ?? "").trim(),
      }),
    );

    const result = {
      reference: data.reference ?? reference,
      verses,
      text: (data.text ?? "").trim(),
      translation: data.translation_name ?? "World English Bible",
      fetchedAt: Date.now(),
    };

    cache.set(cacheKey, result);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Bible API is temporarily unavailable" },
      { status: 502 },
    );
  }
}
