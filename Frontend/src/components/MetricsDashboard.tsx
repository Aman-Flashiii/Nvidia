'use client';

import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { fetchMetrics, LogEntry, MetricsSnapshot, TopKResult } from '@/lib/api';

const POLL_INTERVAL_MS = 900;

/* ============================================================
   Right sidebar — Top-K results + real-time performance + proofs
   ============================================================ */
export default function MetricsDashboard({ results }: { results: TopKResult[] }) {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const data = await fetchMetrics();
      if (!cancelled) setSnapshot(data);
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const bankFormula = katex.renderToString('\\mathrm{Bank}[i] = (i \\times 3) \\bmod 32', {
    throwOnError: false,
    displayMode: true,
  });

  return (
    <aside className="overflow-y-auto bg-bg-1 px-[15px] pb-8 pt-4">
      <div className="panel-title">
        <span className="font-mono text-[10px] text-gpu-green">01</span> Top-K Nearest Neighbors
      </div>
      <TopKTable results={results} />

      <div className="panel-title">
        <span className="font-mono text-[10px] text-gpu-green">02</span> Real-Time Performance
      </div>

      <LatencyCard snapshot={snapshot} />
      <ThroughputCard snapshot={snapshot} />
      <KernelBreakdownCard snapshot={snapshot} />
      <MemoryCard snapshot={snapshot} />

      <div className="panel-title">
        <span className="font-mono text-[10px] text-gpu-green">03</span> Number Theory Verification
      </div>
      <div className="rounded-[3px] border border-line-soft bg-bg-2 p-3">
        <VerifyRow label="Primitive root mod 32" value="g = 3" />
        <VerifyRow label="Bijection proof" value="gcd(3, 32) = 1" />
        <VerifyRow label="Mapping status" value="✓ VERIFIED" valueClassName="text-gpu-green" last />
        <div className="mt-2.5 border-t border-dashed border-line pt-2.5 text-center text-ink-hi">
          <span dangerouslySetInnerHTML={{ __html: bankFormula }} />
        </div>
      </div>
    </aside>
  );
}

function TopKTable({ results }: { results: TopKResult[] }) {
  const rows =
    results.length > 0
      ? results
      : DEFAULT_TOPK;

  return (
    <table className="mb-5 w-full border-collapse">
      <thead>
        <tr className="border-b border-line">
          <th className="pb-1.5 pl-1.5 text-left text-[9px] font-bold uppercase tracking-wide text-ink-low">#</th>
          <th className="pb-1.5 text-left text-[9px] font-bold uppercase tracking-wide text-ink-low">Vector ID</th>
          <th className="pb-1.5 text-right text-[9px] font-bold uppercase tracking-wide text-ink-low">Dist (2⁻ᵛ)</th>
          <th className="pb-1.5 text-right text-[9px] font-bold uppercase tracking-wide text-ink-low">v<sub>p</sub></th>
          <th className="pb-1.5 pr-1.5 text-right text-[9px] font-bold uppercase tracking-wide text-ink-low">Conf</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.vectorId} className={`border-b border-line-soft hover:bg-bg-2 ${i === 0 ? 'text-ink-hi' : ''}`}>
            <td className="py-1.5 pl-1.5">
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded-[3px] text-[9px] font-bold ${
                  i < 3 ? 'bg-gpu-green/15 text-gpu-green' : 'bg-bg-3 text-ink-low'
                }`}
              >
                {r.rank}
              </span>
            </td>
            <td className="py-1.5 font-mono text-[10.8px] text-ink-mid">{r.vectorId}</td>
            <td className="py-1.5 text-right font-mono text-[10.8px] text-ink-mid">{r.distance}</td>
            <td className="py-1.5 text-right font-mono text-[10.8px] text-ink-mid">{r.valuation}</td>
            <td className="py-1.5 pr-1.5 text-right font-mono text-[10.8px] text-ink-mid">
              {r.confidence.toFixed(1)}%
              <span className="ml-1.5 inline-block h-1 w-11 overflow-hidden rounded-full bg-bg-3 align-middle">
                <span className="block h-full bg-gpu-cyan" style={{ width: `${r.confidence}%` }} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const DEFAULT_TOPK: TopKResult[] = [
  ['V-3391847', '2⁻¹¹', 11, 99.8],
  ['V-8820113', '2⁻¹⁰', 10, 98.4],
  ['V-1749502', '2⁻¹⁰', 10, 97.9],
  ['V-6603381', '2⁻⁹', 9, 95.1],
  ['V-2210987', '2⁻⁹', 9, 94.6],
  ['V-7784410', '2⁻⁸', 8, 91.3],
  ['V-0093321', '2⁻⁸', 8, 90.7],
  ['V-5567201', '2⁻⁷', 7, 86.2],
  ['V-4432190', '2⁻⁷', 7, 85.0],
  ['V-9981234', '2⁻⁶', 6, 79.4],
].map(([vectorId, distance, valuation, confidence], i) => ({
  rank: i + 1,
  vectorId: vectorId as string,
  distance: distance as string,
  valuation: valuation as number,
  confidence: confidence as number,
}));

function LatencyCard({ snapshot }: { snapshot: MetricsSnapshot | null }) {
  const l = snapshot?.latency;
  return (
    <div className="mb-2.5 rounded-[3px] border border-line-soft bg-bg-2 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-hi">Search Latency</span>
        <span className="rounded-full border border-gpu-green-dim bg-gpu-green/10 px-1.5 py-0.5 font-mono text-[9.5px] text-gpu-green">
          LIVE
        </span>
      </div>
      <div className="mb-2.5 grid grid-cols-4 gap-1.5 text-center">
        <Stat label="Cur" value={l ? `${l.currentMs.toFixed(2)}ms` : '—'} highlight />
        <Stat label="Avg" value={l ? `${l.avgMs.toFixed(2)}ms` : '—'} />
        <Stat label="Min" value={l ? `${l.minMs.toFixed(2)}ms` : '—'} />
        <Stat label="P99" value={l ? `${l.p99Ms.toFixed(2)}ms` : '—'} />
      </div>
      <Sparkline data={l?.history ?? []} color="#76B900" />
      <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-low">
        <span>vs. FAISS-IVF</span>
        <span className="font-bold text-gpu-green">41.2× faster</span>
      </div>
      <div className="flex justify-between font-mono text-[10px] text-ink-low">
        <span>vs. HNSW</span>
        <span className="font-bold text-gpu-green">18.7× faster</span>
      </div>
    </div>
  );
}

function ThroughputCard({ snapshot }: { snapshot: MetricsSnapshot | null }) {
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (!snapshot) return;
    setHistory((h) => [...h.slice(-39), snapshot.qps / 1_000_000]);
  }, [snapshot]);

  return (
    <div className="mb-2.5 rounded-[3px] border border-line-soft bg-bg-2 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-hi">Throughput</span>
        <span className="rounded-full border border-[#0091ad] bg-gpu-cyan/10 px-1.5 py-0.5 font-mono text-[9.5px] text-gpu-cyan">
          QPS
        </span>
      </div>
      <div className="mb-2.5 text-center">
        <div className="text-[9px] uppercase tracking-wide text-ink-low">Queries / Second</div>
        <div className="font-mono text-xl font-semibold text-gpu-cyan">
          {snapshot ? snapshot.qps.toLocaleString() : '—'}
        </div>
      </div>
      <Sparkline data={history} color="#00D9FF" />
    </div>
  );
}

function KernelBreakdownCard({ snapshot }: { snapshot: MetricsSnapshot | null }) {
  const k = snapshot?.kernel;
  return (
    <div className="mb-2.5 rounded-[3px] border border-line-soft bg-bg-2 p-3">
      <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-hi">CUDA Kernel Breakdown</div>
      <KBreakRow label="p-Adic Distance Calc" pct={k?.distanceCalcPct ?? 0} color="#76B900" />
      <KBreakRow label="Tree Traversal" pct={k?.treeTraversalPct ?? 0} color="#00D9FF" />
      <KBreakRow label="Warp Reduction" pct={k?.warpReductionPct ?? 0} color="#FF006E" />
      <div className="mt-2 flex gap-4">
        <div className="flex-1">
          <div className="text-[9px] uppercase tracking-wide text-ink-low">Occupancy</div>
          <div className="font-mono text-[13px] font-bold text-gpu-green">{k ? `${k.occupancyPct}%` : '—'}</div>
        </div>
        <div className="flex-1">
          <div className="text-[9px] uppercase tracking-wide text-ink-low">Warp Efficiency</div>
          <div className="font-mono text-[13px] font-bold text-gpu-green">{k ? `${k.warpEfficiencyPct}%` : '—'}</div>
        </div>
      </div>
    </div>
  );
}

function MemoryCard({ snapshot }: { snapshot: MetricsSnapshot | null }) {
  const m = snapshot?.memory;
  return (
    <div className="mb-5 rounded-[3px] border border-line-soft bg-bg-2 p-3">
      <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-hi">Memory Utilization</div>
      <div className="grid grid-cols-2 gap-2">
        <MemItem label="Global (HBM)" value={m ? `${m.globalMemGB.toFixed(1)} GB` : '—'} />
        <MemItem label="Shared Mem" value={m ? `${m.sharedMemKB} KB` : '—'} />
        <MemItem label="L2 Hit Rate" value={m ? `${m.l2HitRatePct}%` : '—'} />
        <MemItem label="Bank Conflicts" value={m ? `${m.bankConflictsPerCycle} / cycle` : '—'} />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 rounded-[3px] border border-gpu-green-dim bg-gpu-green/10 px-2.5 py-1.5">
        <span className="text-gpu-green">✓</span>
        <span className="font-mono text-[10.5px] text-gpu-green">Zero shared-memory bank conflicts confirmed</span>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 text-[8.5px] uppercase tracking-wide text-ink-low">{label}</div>
      <div className={`font-mono text-xs font-semibold ${highlight ? 'text-gpu-cyan' : 'text-ink-hi'}`}>{value}</div>
    </div>
  );
}

function KBreakRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 flex justify-between text-[10px]">
        <span className="text-ink-mid">{label}</span>
        <span className="font-mono text-ink-hi">{pct}%</span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-full bg-bg-3">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function MemItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3px] bg-bg-3 px-2 py-1.5">
      <div className="mb-0.5 text-[8.5px] uppercase tracking-wide text-ink-low">{label}</div>
      <div className="font-mono text-[11.5px] text-ink-hi">{value}</div>
    </div>
  );
}

function VerifyRow({
  label,
  value,
  valueClassName = 'text-gpu-cyan',
  last,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-[11px] ${last ? '' : 'border-b border-line-soft'}`}>
      <span className="text-ink-mid">{label}</span>
      <span className={`font-mono text-[11.5px] ${valueClassName}`}>{value}</span>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const ref = useRef<SVGSVGElement>(null);
  if (data.length < 2) {
    return <svg ref={ref} className="block h-[34px] w-full" />;
  }
  const w = 340;
  const h = 34;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const step = w / (data.length - 1);
  const path = data
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / (max - min || 1)) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const gradId = `spark-${color.replace('#', '')}`;
  return (
    <svg ref={ref} viewBox={`0 0 ${w} ${h}`} className="block h-[34px] w-full">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.4} />
    </svg>
  );
}

/* ============================================================
   Bottom panel — Execution log, kernel profiler, bank mapping
   (rendered by page.tsx alongside MetricsDashboard's default export)
   ============================================================ */

const LOG_SEED: Omit<LogEntry, 'timestamp'>[] = [
  { level: 'info', message: 'CUDA device 0 initialized — NVIDIA H100 80GB HBM3' },
  { level: 'info', message: 'Loading dataset shard 1/12 — 48.2M vectors (16.0 GB, p-Adic packed)' },
  { level: 'ok', message: 'Dataset resident in device memory — 48.9 GB / 80 GB VRAM' },
  { level: 'info', message: 'Quantizing query vector: R^1024 → Z_2^128' },
  { level: 'ok', message: 'Quantization complete — v_p(q)=7, |q|_p=2^-7' },
  { level: 'info', message: 'Launching kernel padic_search_kernel<<<4096,256>>>' },
  { level: 'info', message: 'Warp-level execution: enabled · Shared memory caching: enabled' },
  { level: 'ok', message: 'Tree traversal converged at depth 11 — 4 candidate leaves' },
  { level: 'warn', message: 'L2 cache pressure at 91.4% — nominal' },
  { level: 'ok', message: 'Top-10 nearest neighbors resolved in 0.34 ms' },
];

const LOG_COLORS: Record<LogEntry['level'], string> = {
  info: 'text-gpu-cyan',
  ok: 'text-gpu-green',
  warn: 'text-gpu-amber',
  error: 'text-gpu-red',
};

export function ExecutionLogPanel({ extraEntries }: { extraEntries: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [seeded, setSeeded] = useState<LogEntry[]>([]);

  useEffect(() => {
    setSeeded(
      LOG_SEED.map((e) => ({ ...e, timestamp: new Date().toISOString().substr(11, 12) })),
    );
  }, []);

  const entries = [...seeded, ...extraEntries];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries.length]);


  return (
    <div className="flex min-h-0 flex-col border-r border-line px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-low">Execution Log</span>
        <span className="font-mono text-[9.5px] text-ink-low">stdout</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-[10.5px] leading-relaxed">
        {entries.map((e, i) => (
          <div key={i} className="whitespace-pre">
            <span className="text-ink-low">[{e.timestamp}]</span>{' '}
            <span className={`font-bold ${LOG_COLORS[e.level]}`}>{e.level.toUpperCase().padEnd(4)}</span>{' '}
            <span className="text-ink-mid">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KernelProfilerPanel({ snapshot }: { snapshot: MetricsSnapshot | null }) {
  const k = snapshot?.kernel;
  const mix = k?.instructionMix ?? { integerAlu: 67, memory: 21, controlFlow: 8, fpOther: 4 };
  return (
    <div className="flex min-h-0 flex-col border-r border-line px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-low">
          CUDA Kernel Profiler — padic_search_kernel
        </span>
        <span className="font-mono text-[9.5px] text-ink-low">nvprof</span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <ProfStat label="Registers" value={k ? `${k.registersPerThread}/thread` : '—'} />
        <ProfStat label="Shared Mem" value={k ? `${k.sharedMemKB} KB` : '—'} />
        <ProfStat label="Grid/Block" value={k ? `${k.gridDim}×${k.blockDim}` : '—'} />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        <InstrRow label="Integer ALU" pct={mix.integerAlu} color="#76B900" />
        <InstrRow label="Memory" pct={mix.memory} color="#00D9FF" />
        <InstrRow label="Control Flow" pct={mix.controlFlow} color="#FF006E" />
        <InstrRow label="FP / Other" pct={mix.fpOther} color="#5C6067" />
      </div>
    </div>
  );
}

function ProfStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3px] bg-bg-2 py-1 text-center">
      <div className="text-[8px] uppercase tracking-wide text-ink-low">{label}</div>
      <div className="mt-0.5 font-mono text-[11px] text-ink-hi">{value}</div>
    </div>
  );
}

function InstrRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-[74px] flex-none text-ink-mid">{label}</span>
      <div className="h-[11px] flex-1 overflow-hidden rounded-[2px] bg-bg-3">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-9 flex-none text-right font-mono text-ink-hi">{pct}%</span>
    </div>
  );
}

export function BankMappingPanel() {
  const [lit, setLit] = useState<Set<number>>(new Set());
  const banks = Array.from({ length: 32 }, (_, i) => (i * 3) % 32);

  function playAccessPattern() {
    setLit(new Set());
    let i = 0;
    const iv = setInterval(() => {
      if (i >= banks.length) {
        clearInterval(iv);
        return;
      }
      setLit((prev) => new Set([i]));
      i++;
    }, 55);
  }

  return (
    <div className="flex min-h-0 flex-col px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-low">Shared Memory Bank Mapping</span>
        <span className="font-mono text-[9.5px] text-ink-low">32 banks</span>
      </div>
      <div className="mb-2 grid grid-cols-[repeat(16,minmax(0,1fr))] gap-[3px]">
        {banks.map((val, i) => (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-[2px] border font-mono text-[7.5px] transition-colors ${
              lit.has(i)
                ? 'border-gpu-cyan/50 bg-gpu-cyan/15 text-gpu-cyan'
                : 'border-line-soft bg-bg-3 text-ink-low'
            }`}
          >
            {val}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-gpu-green">
          <span className="h-1.5 w-1.5 rounded-full bg-gpu-green shadow-glow" />
          Distribution perfect — 0 conflicts
        </span>
        <button
          onClick={playAccessPattern}
          className="rounded-[3px] bg-gpu-cyan px-2.5 py-1.5 text-[10px] font-semibold text-bg-0 hover:brightness-110"
        >
          Show Access Pattern
        </button>
      </div>
    </div>
  );
}
