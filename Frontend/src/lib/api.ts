import axios, { AxiosInstance } from 'axios';

// Empty string means "same origin" — the browser will call the Next.js
// API proxy routes at /api/*, which then forward to the C++ backend.
// Set NEXT_PUBLIC_API_BASE_URL in .env.local to override (e.g. for production).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
});

/* ============================== Types ============================== */

export interface SearchConfig {
  topK: number;
  prime: 2 | 3 | 5 | 7;
  integerWidth: 64 | 128 | 256;
  warpLevelExecution: boolean;
  sharedMemoryCaching: boolean;
  tensorCorePacking: boolean;
}

export interface QueryVectorSummary {
  norm: number;
  dimension: number;
  hexRepresentation: string;
  valuation: number;
  absoluteValue: string;
}

export interface TopKResult {
  rank: number;
  vectorId: string;
  distance: string;
  valuation: number;
  confidence: number;
}

export interface TreeNode {
  id: number;
  parentId: number | null;
  level: number;
  x: number;
  subtreeCount: number;
}

export interface SearchResponse {
  queryVector: QueryVectorSummary;
  results: TopKResult[];
  searchPath: number[];
  tree: TreeNode[];
  latencyMs: number;
}

export interface LatencyStats {
  currentMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p99Ms: number;
  history: number[];
}

export interface KernelBreakdown {
  distanceCalcPct: number;
  treeTraversalPct: number;
  warpReductionPct: number;
  occupancyPct: number;
  warpEfficiencyPct: number;
  registersPerThread: number;
  sharedMemKB: number;
  gridDim: string;
  blockDim: string;
  instructionMix: { integerAlu: number; memory: number; controlFlow: number; fpOther: number };
}

export interface MemoryUtilization {
  globalMemGB: number;
  sharedMemKB: number;
  l2HitRatePct: number;
  bankConflictsPerCycle: number;
}

export interface DatasetInfo {
  vectorCount: number;
  rawDimension: number;
  rawSizeGB: number;
  compressedSizeGB: number;
  vramUsedGB: number;
  vramTotalGB: number;
}

export interface MetricsSnapshot {
  qps: number;
  latency: LatencyStats;
  kernel: KernelBreakdown;
  memory: MemoryUtilization;
  dataset: DatasetInfo;
  timestamp: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'ok' | 'warn' | 'error';
  message: string;
}

/* ============================== Requests ============================== */

/**
 * Runs a p-Adic ultrametric search against the FastAPI backend.
 * Falls back to a locally generated mock response if the backend
 * is unreachable, so the UI stays usable in isolation during development.
 */
export async function runSearch(
  vector: number[],
  config: SearchConfig,
): Promise<SearchResponse> {
  try {
    const { data } = await apiClient.post<SearchResponse>('/api/search', {
      vector,
      config,
    });
    return data;
  } catch (err) {
    console.warn('[api] /api/search unreachable, using mock response', err);
    return mockSearchResponse(config);
  }
}

export async function fetchMetrics(): Promise<MetricsSnapshot> {
  try {
    const { data } = await apiClient.get<MetricsSnapshot>('/api/metrics');
    return data;
  } catch (err) {
    return mockMetricsSnapshot();
  }
}

export async function fetchExecutionLog(limit = 50): Promise<LogEntry[]> {
  try {
    const { data } = await apiClient.get<LogEntry[]>('/api/logs', { params: { limit } });
    return data;
  } catch (err) {
    return [];
  }
}

export async function loadVectorFile(file: File): Promise<number[]> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<{ vector: number[] }>('/api/vectors/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.vector;
}

/* ============================== Mocks ============================== */

function mockSearchResponse(config: SearchConfig): SearchResponse {
  const results: TopKResult[] = Array.from({ length: config.topK }, (_, i) => ({
    rank: i + 1,
    vectorId: `V-${Math.floor(1_000_000 + Math.random() * 9_000_000)}`,
    distance: `2⁻${11 - Math.min(i, 10)}`,
    valuation: 11 - Math.min(i, 10),
    confidence: Math.max(50, 99.8 - i * 2.1),
  }));

  return {
    queryVector: {
      norm: 1.00042,
      dimension: 1024,
      hexRepresentation: '0x9F3C7A1E4B02D8F6A17C0B3E2D5F41A8',
      valuation: 7,
      absoluteValue: '2⁻⁷',
    },
    results,
    searchPath: [],
    tree: [],
    latencyMs: 0.28 + Math.random() * 0.6,
  };
}

function mockMetricsSnapshot(): MetricsSnapshot {
  return {
    qps: Math.round((2.4 + Math.random() * 0.9) * 1_000_000),
    latency: {
      currentMs: 0.28 + Math.random() * 0.6,
      avgMs: 0.41,
      minMs: 0.28,
      maxMs: 1.12,
      p99Ms: 0.89,
      history: Array.from({ length: 40 }, () => 0.28 + Math.random() * 0.6),
    },
    kernel: {
      distanceCalcPct: 42,
      treeTraversalPct: 37,
      warpReductionPct: 21,
      occupancyPct: 96.8,
      warpEfficiencyPct: 99.1,
      registersPerThread: 48,
      sharedMemKB: 227,
      gridDim: '4096',
      blockDim: '256',
      instructionMix: { integerAlu: 67, memory: 21, controlFlow: 8, fpOther: 4 },
    },
    memory: {
      globalMemGB: 48.9,
      sharedMemKB: 227,
      l2HitRatePct: 91.4,
      bankConflictsPerCycle: 0,
    },
    dataset: {
      vectorCount: 48_200_000,
      rawDimension: 1024,
      rawSizeGB: 480,
      compressedSizeGB: 16,
      vramUsedGB: 48.9,
      vramTotalGB: 80,
    },
    timestamp: new Date().toISOString(),
  };
}
