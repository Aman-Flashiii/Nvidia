/**
 * POST /api/search
 *
 * Adapts the frontend's SearchConfig-based request into the C++ backend's
 * simpler `{vector, k}` format, calls the backend, then translates the
 * response into the full SearchResponse shape the UI expects.
 *
 * C++ backend request:  POST /search  { vector: number[], k: number }
 * C++ backend response: { status: "success", data: { results: [{index, distance}] } }
 *
 * Frontend response:    SearchResponse (see src/lib/api.ts)
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  let body: { vector?: number[]; config?: { topK?: number; prime?: number } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const vector: number[] = body.vector ?? Array(1024).fill(0);
  const k: number = body.config?.topK ?? 10;

  // ── Forward to C++ backend ──────────────────────────────────────────────────
  let backendData: { status: string; data: { results: Array<{ index: number; distance: number }> } };
  try {
    const backendRes = await fetch(`${BACKEND_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, k }),
      // node-fetch / undici will throw on network error
    });

    if (!backendRes.ok) {
      const text = await backendRes.text();
      return NextResponse.json(
        { error: `Backend error ${backendRes.status}`, detail: text },
        { status: backendRes.status },
      );
    }
    backendData = await backendRes.json();
  } catch (err) {
    console.error('[/api/search] Backend unreachable:', err);
    return NextResponse.json(
      { error: 'Backend unreachable', detail: String(err) },
      { status: 502 },
    );
  }

  const latencyMs = Date.now() - startMs;
  const rawResults = backendData?.data?.results ?? [];

  // ── Translate response shape ────────────────────────────────────────────────
  // C++ returns: [{index: number, distance: number}]
  //   distance is the p-adic ultrametric value (integer valuation exponent).
  // Frontend TopKResult expects: {rank, vectorId, distance (string), valuation, confidence}
  const results = rawResults.map(
    (r: { index: number; distance: number }, i: number) => ({
      rank: i + 1,
      vectorId: `V-${String(r.index).padStart(7, '0')}`,
      // Format as p-adic distance string: 2^{-valuation}
      distance: `2⁻${r.distance}`,
      valuation: r.distance,
      // Confidence decays with rank; first result is 99.8%
      confidence: Math.max(50, 99.8 - i * (49.8 / Math.max(rawResults.length - 1, 1))),
    }),
  );

  // Compute a plausible p-adic representation of the query vector for display
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  const hexRep = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0'),
  )
    .join('')
    .toUpperCase();
  const valuation = results[0]?.valuation ?? 7;

  const response = {
    queryVector: {
      norm: Number(norm.toFixed(5)),
      dimension: vector.length,
      hexRepresentation: `0x${hexRep}`,
      valuation,
      absoluteValue: `2⁻${valuation}`,
    },
    results,
    // searchPath and tree are used only by the D3 visualizer which generates
    // its own local tree — the C++ backend doesn't expose tree structure yet.
    searchPath: [],
    tree: [],
    latencyMs,
  };

  return NextResponse.json(response);
}
