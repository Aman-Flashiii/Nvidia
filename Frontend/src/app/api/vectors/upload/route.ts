/**
 * POST /api/vectors/upload
 *
 * Accepts a multipart/form-data file upload from the SearchPanel "Load .npy"
 * button. Parses the file on the server (JSON array, CSV row, or raw binary
 * float32 buffer) and returns a normalized 1024-D float vector.
 *
 * The C++ backend has no upload endpoint — all parsing happens here so we
 * don't need to extend the C++ code.
 */

import { NextRequest, NextResponse } from 'next/server';

const TARGET_DIM = 1024;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided in field "file"' }, { status: 400 });
  }

  const filename = (file as File).name.toLowerCase();
  const buffer = Buffer.from(await (file as File).arrayBuffer());

  let vector: number[] = [];

  try {
    if (filename.endsWith('.json')) {
      // ── JSON: parse directly ──────────────────────────────────────────────
      const parsed = JSON.parse(buffer.toString('utf8'));
      if (Array.isArray(parsed)) {
        vector = (parsed as unknown[]).map(Number).filter(isFinite);
      } else {
        return NextResponse.json({ error: 'JSON file must contain a flat number array' }, { status: 422 });
      }
    } else if (filename.endsWith('.csv')) {
      // ── CSV: first row, comma-separated floats ────────────────────────────
      const text = buffer.toString('utf8');
      const firstLine = text.split('\n')[0] ?? '';
      vector = firstLine
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter(isFinite);
    } else if (filename.endsWith('.npy')) {
      // ── NPY: minimal NumPy v1.0 parser ───────────────────────────────────
      // Magic: \x93NUMPY (6 bytes), version (2 bytes), header_len (2 bytes LE),
      // then ASCII header, then raw float32 LE data.
      const MAGIC = '\x93NUMPY';
      const magic = buffer.slice(0, 6).toString('latin1');
      if (!magic.startsWith(MAGIC)) {
        return NextResponse.json({ error: 'File does not appear to be a valid .npy file' }, { status: 422 });
      }
      const headerLen = buffer.readUInt16LE(8);
      const dataOffset = 10 + headerLen;
      const floatCount = Math.floor((buffer.length - dataOffset) / 4);
      for (let i = 0; i < floatCount; i++) {
        vector.push(buffer.readFloatLE(dataOffset + i * 4));
      }
    } else {
      // ── Fallback: try raw float32 binary ─────────────────────────────────
      const floatCount = Math.floor(buffer.length / 4);
      for (let i = 0; i < floatCount; i++) {
        vector.push(buffer.readFloatLE(i * 4));
      }
    }
  } catch (err) {
    return NextResponse.json({ error: 'Failed to parse file', detail: String(err) }, { status: 422 });
  }

  if (vector.length === 0) {
    return NextResponse.json({ error: 'Parsed vector is empty' }, { status: 422 });
  }

  // ── Normalize / resize to TARGET_DIM ────────────────────────────────────────
  // Truncate if too long, zero-pad if too short
  if (vector.length > TARGET_DIM) {
    vector = vector.slice(0, TARGET_DIM);
  } else {
    while (vector.length < TARGET_DIM) vector.push(0);
  }

  // L2-normalize
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    vector = vector.map((v) => v / norm);
  }

  return NextResponse.json({ vector });
}
