'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import SearchPanel from '@/components/SearchPanel';
import UltrametricTreeVisualizer from '@/components/UltrametricTreeVisualizer';
import MetricsDashboard, {
  BankMappingPanel,
  ExecutionLogPanel,
  KernelProfilerPanel,
} from '@/components/MetricsDashboard';
import { fetchMetrics, LogEntry, MetricsSnapshot, SearchResponse, TopKResult } from '@/lib/api';

export default function DashboardPage() {
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [results, setResults] = useState<TopKResult[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [kernelSnapshot, setKernelSnapshot] = useState<MetricsSnapshot | null>(null);
  const [now, setNow] = useState<string>('');

  useEffect(() => {
    const tick = () => setNow(new Date().toUTCString().split(' ')[4] + ' UTC');
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const snap = await fetchMetrics();
      if (!cancelled) setKernelSnapshot(snap);
    }
    poll();
    const id = setInterval(poll, 900);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function handleSearchComplete(result: SearchResponse) {
    setResults(result.results);
    setSearchTrigger((t) => t + 1);
    setLogEntries((entries) => [
      ...entries,
      {
        timestamp: new Date().toISOString().substr(11, 12),
        level: 'info',
        message: `New query dispatched — grid<4096,256> · Top-${result.results.length}`,
      },
      {
        timestamp: new Date().toISOString().substr(11, 12),
        level: 'ok',
        message: `Search path resolved — latency ${result.latencyMs.toFixed(2)}ms`,
      },
    ]);
  }

  return (
    <div className="grid h-screen min-h-[900px] min-w-[1400px] grid-rows-dashboard">
      {/* ===================== HEADER ===================== */}
      <header className="flex items-center gap-7 border-b border-line bg-gradient-to-b from-bg-2 to-bg-1 px-5">
        <div className="flex items-center gap-2.5 border-r border-line pr-6">
          <Image src="/logo.svg" alt="" width={26} height={26} />
          <div className="font-mono text-[13px] font-bold leading-tight tracking-wide text-ink-hi">
            P-ADIC ULTRAMETRIC
            <span className="mt-0.5 block text-[9px] font-medium tracking-[0.14em] text-ink-low">
              VECTOR SEARCH ENGINE // v2.4.1
            </span>
          </div>
        </div>

        <HeaderStat label="CUDA Device">
          <span className="h-1.5 w-1.5 flex-none animate-pulse-dot rounded-full bg-gpu-green shadow-glow" />
          GPU 0 — NVIDIA H100 80GB
        </HeaderStat>
        <HeaderStat label="Driver / CUDA">550.90.07 / 12.4</HeaderStat>
        <HeaderStat label="Compute Cap.">9.0</HeaderStat>
        <HeaderStat label="GPU Util" valueClassName="text-gpu-green">
          94%
        </HeaderStat>
        <HeaderStat label="Temp">61°C</HeaderStat>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5 rounded-[3px] border border-gpu-green-dim bg-gpu-green/10 px-2.5 py-1.5 font-mono text-[11px] text-gpu-green">
          <span className="h-1.5 w-1.5 rounded-full bg-gpu-green shadow-glow" />
          KERNEL RESIDENT
        </div>
        <div className="font-mono text-xs text-ink-mid">{now}</div>
      </header>

      {/* ===================== BODY ===================== */}
      <div className="grid min-h-0 grid-cols-dashboard overflow-hidden">
        <SearchPanel onSearchComplete={handleSearchComplete} />
        <UltrametricTreeVisualizer searchTrigger={searchTrigger} />
        <MetricsDashboard results={results} />
      </div>

      {/* ===================== BOTTOM PANEL ===================== */}
      <div className="grid min-h-0 grid-cols-3 border-t border-line bg-bg-1">
        <ExecutionLogPanel extraEntries={logEntries} />
        <KernelProfilerPanel snapshot={kernelSnapshot} />
        <BankMappingPanel />
      </div>
    </div>
  );
}

function HeaderStat({
  label,
  children,
  valueClassName = 'text-ink-hi',
}: {
  label: string;
  children: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-low">{label}</div>
      <div className={`flex items-center gap-1.5 font-mono text-[12.5px] font-medium ${valueClassName}`}>
        {children}
      </div>
    </div>
  );
}
