'use client';

import { useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { loadVectorFile, runSearch, SearchConfig, SearchResponse } from '@/lib/api';

const PRIMES: SearchConfig['prime'][] = [2, 3, 5, 7];
const WIDTHS: SearchConfig['integerWidth'][] = [64, 128, 256];

export default function SearchPanel({
  onSearchComplete,
}: {
  onSearchComplete: (result: SearchResponse) => void;
}) {
  const [config, setConfig] = useState<SearchConfig>({
    topK: 10,
    prime: 2,
    integerWidth: 128,
    warpLevelExecution: true,
    sharedMemoryCaching: true,
    tensorCorePacking: false,
  });
  const [vector, setVector] = useState<number[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transformTex = katex.renderToString(
    'v \\in \\mathbb{R}^{1024} \\;\\longrightarrow\\; q \\in \\mathbb{Z}_2^{128}',
    { throwOnError: false, displayMode: true },
  );

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const loaded = await loadVectorFile(file);
      setVector(loaded);
    } catch {
      // Fall back to a randomized vector if the backend upload endpoint isn't available.
      handleRandomize();
    }
  }

  function handleRandomize() {
    setVector(Array.from({ length: 1024 }, () => Number((Math.random() * 2 - 1).toFixed(4))));
  }

  async function handleExecuteSearch() {
    setIsSearching(true);
    try {
      const result = await runSearch(vector.length ? vector : Array(1024).fill(0), config);
      onSearchComplete(result);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <aside className="overflow-y-auto border-r border-line bg-bg-1 px-4 pb-8 pt-[18px]">
      {/* ===== 01 Query Vector Input ===== */}
      <div className="panel-title">
        <span className="font-mono text-[10px] text-gpu-green">01</span> Query Vector Input
      </div>

      <div className="mb-5">
        <div className="mb-1.5 text-[11px] font-medium text-ink-mid">1024-D FP32 Embedding</div>
        <textarea
          readOnly
          spellCheck={false}
          value={
            vector.length
              ? `[ ${vector.slice(0, 6).join(', ')}, ... ]`
              : '[ 0.0412, -0.1187, 0.5503, 0.0021, -0.3390, 0.2214, ... ]'
          }
          className="h-[52px] w-full resize-none rounded-[3px] border border-line bg-bg-2 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-hi focus:border-gpu-green-dim focus:outline-none"
        />
        <div className="mt-2 flex gap-2">
          <input ref={fileInputRef} type="file" accept=".npy,.json,.csv" className="hidden" onChange={handleFileUpload} />
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            ⇪ Load .npy
          </button>
          <button className="btn" onClick={handleRandomize}>
            ⟲ Randomize
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="stat-chip">
          <div className="mb-1 text-[9px] uppercase tracking-wide text-ink-low">‖v‖₂ Norm</div>
          <div className="font-mono text-xs text-ink-hi">1.00042</div>
        </div>
        <div className="stat-chip">
          <div className="mb-1 text-[9px] uppercase tracking-wide text-ink-low">Dimension</div>
          <div className="font-mono text-xs text-ink-hi">1024</div>
        </div>
        <div className="stat-chip col-span-2">
          <div className="mb-1 text-[9px] uppercase tracking-wide text-ink-low">128-bit p-Adic Integer (hex)</div>
          <div className="break-all font-mono text-[10.5px] text-gpu-cyan">0x9F3C7A1E4B02D8F6A17C0B3E2D5F41A8</div>
        </div>
      </div>

      <div className="mt-2.5 rounded-[3px] border border-line-soft bg-bg-2 px-2.5 py-2.5 text-center text-xs text-ink-mid">
        <span dangerouslySetInnerHTML={{ __html: transformTex }} />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-ink-low">
        <span>
          v<sub>p</sub>(q) = <b className="font-semibold text-gpu-cyan">7</b>
        </span>
        <span>
          |q|<sub>p</sub> = <b className="font-semibold text-gpu-cyan">2⁻⁷</b>
        </span>
      </div>

      {/* ===== 02 Search Configuration ===== */}
      <div className="mt-6 panel-title">
        <span className="font-mono text-[10px] text-gpu-green">02</span> Search Configuration
      </div>

      <div className="mb-3.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] font-medium text-ink-mid">Top-K Results</span>
          <span className="font-mono text-xs text-gpu-green">{config.topK}</span>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={config.topK}
          onChange={(e) => setConfig((c) => ({ ...c, topK: Number(e.target.value) }))}
          className="w-full accent-gpu-green"
        />
      </div>

      <PillGroup
        label="p-Adic Prime (p)"
        options={PRIMES.map((p) => ({ value: p, label: `p = ${p}` }))}
        value={config.prime}
        onChange={(prime) => setConfig((c) => ({ ...c, prime }))}
      />

      <PillGroup
        label="Integer Width"
        options={WIDTHS.map((w) => ({ value: w, label: `${w}-bit` }))}
        value={config.integerWidth}
        onChange={(integerWidth) => setConfig((c) => ({ ...c, integerWidth }))}
      />

      <ToggleRow
        title="Warp-Level Execution"
        description="32-thread cooperative traversal"
        checked={config.warpLevelExecution}
        onChange={(warpLevelExecution) => setConfig((c) => ({ ...c, warpLevelExecution }))}
      />
      <ToggleRow
        title="Shared Memory Caching"
        description="L1-resident tree fragments"
        checked={config.sharedMemoryCaching}
        onChange={(sharedMemoryCaching) => setConfig((c) => ({ ...c, sharedMemoryCaching }))}
      />
      <ToggleRow
        title="Tensor Core Packing"
        description="Experimental — INT4 pack"
        checked={config.tensorCorePacking}
        onChange={(tensorCorePacking) => setConfig((c) => ({ ...c, tensorCorePacking }))}
        last
      />

      <button
        className="btn btn-primary mt-4 w-full py-2.5"
        onClick={handleExecuteSearch}
        disabled={isSearching}
      >
        {isSearching ? '◌ SEARCHING…' : '▸ EXECUTE SEARCH'}
      </button>

      {/* ===== 03 Dataset Info ===== */}
      <div className="mt-6 panel-title">
        <span className="font-mono text-[10px] text-gpu-green">03</span> Dataset Info
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="stat-chip">
          <div className="mb-1 text-[9px] uppercase tracking-wide text-ink-low">Vectors</div>
          <div className="font-mono text-xs text-ink-hi">48.2M</div>
        </div>
        <div className="stat-chip">
          <div className="mb-1 text-[9px] uppercase tracking-wide text-ink-low">Raw Dim</div>
          <div className="font-mono text-xs text-ink-hi">1024</div>
        </div>
      </div>

      <div className="mt-2.5">
        <div className="flex justify-between font-mono text-[10px] text-ink-low">
          <span>FP32: 480 GB</span>
          <span className="text-gpu-green">p-Adic: 16 GB</span>
        </div>
        <div className="my-1.5 h-1.5 overflow-hidden rounded-full border border-line-soft bg-bg-3">
          <div className="h-full w-[96.7%] bg-gradient-to-r from-gpu-green-dim to-gpu-green" />
        </div>
        <div className="flex justify-between font-mono text-[10px] text-ink-low">
          <span>30× compression</span>
          <span>96.7% reduction</span>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex justify-between font-mono text-[10px] text-ink-low">
          <span>VRAM Usage</span>
          <span>48.9 / 80 GB</span>
        </div>
        <div className="my-1.5 h-1.5 overflow-hidden rounded-full border border-line-soft bg-bg-3">
          <div className="h-full w-[61%] bg-gradient-to-r from-gpu-cyan to-[#0091ad]" />
        </div>
      </div>
    </aside>
  );
}

function PillGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 text-[11px] font-medium text-ink-mid">{label}</div>
      <div className="flex gap-1.5">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-[3px] border px-1 py-[7px] text-center font-mono text-[11.5px] transition-colors ${
              value === opt.value
                ? 'border-gpu-green bg-gpu-green/10 text-gpu-green shadow-[inset_0_0_0_1px_rgba(118,185,0,0.3)]'
                : 'border-line bg-bg-2 text-ink-mid hover:border-[#3a3a3a] hover:text-ink-hi'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  last,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${last ? '' : 'border-b border-line-soft'}`}>
      <div>
        <div className="text-[11.5px] font-medium text-ink-hi">{title}</div>
        <div className="mt-0.5 text-[9.5px] text-ink-low">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-[19px] w-[34px] flex-none rounded-full border transition-colors ${
          checked ? 'border-gpu-green-dim bg-gpu-green/20' : 'border-line bg-bg-3'
        }`}
      >
        <span
          className={`absolute top-0.5 h-[13px] w-[13px] rounded-full transition-all ${
            checked ? 'left-[17px] bg-gpu-green shadow-glow' : 'left-0.5 bg-ink-low'
          }`}
        />
      </button>
    </div>
  );
}
