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
const MAX_CACHE_ENTRIES = 500;

function normalizeReference(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isReferenceInputSafe(value: string): boolean {
  if (value.length === 0 || value.length > 120) return false;
  return /^[0-9A-Za-z ,:;\-–]+$/.test(value);
}

function setCachedValue(
  key: string,
  value: {
    reference: string;
    verses: Array<{ verse: number; text: string }>;
    text: string;
    translation: string;
    fetchedAt: number;
  },
) {
  // Keep insertion order as LRU.
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = cache.keys().next().value;
  if (oldest) cache.delete(oldest);
}

export async function GET(request: NextRequest) {
  const rawReference = request.nextUrl.searchParams.get("reference");
  const reference = rawReference ? normalizeReference(rawReference) : "";

  if (!reference) {
    return NextResponse.json({ error: "reference parameter is required" }, { status: 400 });
  }
  if (!isReferenceInputSafe(reference)) {
    return NextResponse.json({ error: "Invalid reference format" }, { status: 422 });
  }

  const cacheKey = reference.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) {
    if (Date.now() - cached.fetchedAt < CACHE_TTL) {
      // Refresh recency on cache hit.
      setCachedValue(cacheKey, cached);
      return NextResponse.json(cached);
    }
    cache.delete(cacheKey);
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

    setCachedValue(cacheKey, result);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Bible API is temporarily unavailable" },
      { status: 502 },
    );
  }
}
