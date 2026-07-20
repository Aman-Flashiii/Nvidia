'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface RawNode {
  id: number;
  x0: number;
  x1: number;
  level: number;
  parentId: number | null;
  count: number;
}

interface LaidOutNode extends RawNode {
  x: number;
  y: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  nodeId: number | null;
}

const MAX_LEVEL = 7;
const MARGIN = { top: 60, right: 40, bottom: 46, left: 40 };

function buildTree(): RawNode[] {
  const nodes: RawNode[] = [];
  let idCounter = 0;

  function recurse(x0: number, x1: number, level: number, parentId: number | null): number {
    const id = idCounter++;
    nodes.push({
      id,
      x0,
      x1,
      level,
      parentId,
      count: Math.round(48_200_000 / Math.pow(2.6, level)),
    });
    if (level < MAX_LEVEL) {
      const mid = (x0 + x1) / 2;
      const jitter = (x1 - x0) * 0.06;
      recurse(x0, mid + (Math.random() - 0.5) * jitter, level + 1, id);
      recurse(mid - (Math.random() - 0.5) * jitter, x1, level + 1, id);
    }
    return id;
  }

  recurse(0, 1, 0, null);
  return nodes;
}

function computeSearchPath(nodes: RawNode[]): number[] {
  const leaves = nodes.filter((n) => n.level === MAX_LEVEL);
  const leaf = leaves[Math.floor(Math.random() * leaves.length)];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: number[] = [];
  let cur: RawNode | undefined = leaf;
  while (cur) {
    path.unshift(cur.id);
    cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

function valuationForLevel(level: number): number {
  return Math.round((level / MAX_LEVEL) * 128);
}

function MathBlock({ tex, display = true }: { tex: string; display?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(tex, { throwOnError: false, displayMode: display }),
    [tex, display],
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function UltrametricTreeVisualizer({
  searchTrigger,
}: {
  /** Incrementing this number triggers a new randomized search path animation. */
  searchTrigger: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tree, setTree] = useState<RawNode[]>(() => buildTree());
  const [searchPath, setSearchPath] = useState<number[]>(() => computeSearchPath(tree));
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, nodeId: null });
  const [dims, setDims] = useState({ w: 900, h: 700 });

  // Re-randomize the highlighted search path whenever the parent triggers a new search.
  useEffect(() => {
    setSearchPath(computeSearchPath(tree));
  }, [searchTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track container size for a responsive SVG.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const byId = useMemo(() => new Map(tree.map((n) => [n.id, n])), [tree]);
  const searchSet = useMemo(() => new Set(searchPath), [searchPath]);

  const laidOut: LaidOutNode[] = useMemo(() => {
    const innerW = dims.w - MARGIN.left - MARGIN.right;
    const innerH = dims.h - MARGIN.top - MARGIN.bottom;
    const xScale = d3.scaleLinear().domain([0, 1]).range([MARGIN.left, MARGIN.left + innerW]);
    const yScale = d3.scaleLinear().domain([0, MAX_LEVEL]).range([MARGIN.top, MARGIN.top + innerH]);
    return tree.map((n) => ({ ...n, x: xScale((n.x0 + n.x1) / 2), y: yScale(n.level) }));
  }, [tree, dims]);

  const laidOutById = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut]);

  // D3 renders the SVG imperatively for full control over glow filters, gradients, and motion paths.
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'node-glow').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
    filter.append('feGaussianBlur').attr('stdDeviation', 2.6).attr('result', 'blur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Valuation gridlines
    const gridGroup = svg.append('g').attr('class', 'grid');
    for (let l = 0; l <= MAX_LEVEL; l++) {
      const y = MARGIN.top + (l / MAX_LEVEL) * (dims.h - MARGIN.top - MARGIN.bottom);
      gridGroup
        .append('line')
        .attr('x1', MARGIN.left)
        .attr('x2', dims.w - MARGIN.right)
        .attr('y1', y)
        .attr('y2', y)
        .attr('stroke', '#161719')
        .attr('stroke-width', 1);
      gridGroup
        .append('text')
        .attr('x', MARGIN.left - 8)
        .attr('y', y + 3)
        .attr('text-anchor', 'end')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', 9)
        .attr('fill', '#4A4D52')
        .text(valuationForLevel(l));
    }

    // Links
    const linkGroup = svg.append('g').attr('class', 'links');
    tree
      .filter((n) => n.parentId !== null)
      .forEach((n) => {
        const a = laidOutById.get(n.parentId as number)!;
        const b = laidOutById.get(n.id)!;
        const active = searchSet.has(a.id) && searchSet.has(b.id);
        const midY = (a.y + b.y) / 2;
        const d = `M${a.x},${a.y} C${a.x},${midY} ${b.x},${midY} ${b.x},${b.y}`;
        linkGroup
          .append('path')
          .attr('d', d)
          .attr('fill', 'none')
          .attr('stroke', active ? '#76B900' : '#2A2C2F')
          .attr('stroke-width', active ? 2.2 : 1.1)
          .attr('opacity', active ? 0.95 : 1)
          .attr('filter', active ? 'url(#node-glow)' : null);
      });

    // Particles flowing along the active search path
    const particleGroup = svg.append('g').attr('class', 'particles');
    searchPath.forEach((id, i) => {
      const nextId = searchPath[i + 1];
      if (nextId === undefined) return;
      const a = laidOutById.get(id)!;
      const b = laidOutById.get(nextId)!;
      const circle = particleGroup
        .append('circle')
        .attr('r', 2.6)
        .attr('fill', '#B6FF3C');
      const motion = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
      motion.setAttribute('dur', '1.1s');
      motion.setAttribute('begin', `${i * 0.08}s`);
      motion.setAttribute('repeatCount', 'indefinite');
      motion.setAttribute('path', `M${a.x},${a.y} L${b.x},${b.y}`);
      (circle.node() as SVGCircleElement).appendChild(motion);
    });

    // Nodes
    const nodeGroup = svg.append('g').attr('class', 'nodes');
    nodeGroup
      .selectAll('circle.pnode')
      .data(laidOut)
      .join('circle')
      .attr('class', 'pnode')
      .attr('cx', (n) => n.x)
      .attr('cy', (n) => n.y)
      .attr('r', (n) => (n.level === 0 ? 6 : n.level === MAX_LEVEL ? 3.2 : 4.2))
      .attr('fill', (n) => (searchSet.has(n.id) ? '#76B900' : n.level === MAX_LEVEL ? '#4A4D52' : '#33363A'))
      .attr('stroke', (n) => (searchSet.has(n.id) ? '#B6FF3C' : '#1E2022'))
      .attr('stroke-width', 1.2)
      .attr('filter', (n) => (searchSet.has(n.id) ? 'url(#node-glow)' : null))
      .style('cursor', 'pointer')
      .on('mousemove', (event: MouseEvent, n: LaidOutNode) => {
        const box = containerRef.current?.getBoundingClientRect();
        setTooltip({
          visible: true,
          x: event.clientX - (box?.left ?? 0) + 14,
          y: event.clientY - (box?.top ?? 0) - 10,
          nodeId: n.id,
        });
      })
      .on('mouseleave', () => setTooltip((t) => ({ ...t, visible: false })));

    // Query marker — pulses on a mid-depth node of the active path
    const qId = searchPath.length > 2 ? searchPath[Math.min(3, searchPath.length - 2)] : undefined;
    if (qId !== undefined) {
      const qn = laidOutById.get(qId)!;
      const q = svg
        .append('circle')
        .attr('cx', qn.x)
        .attr('cy', qn.y)
        .attr('r', 7)
        .attr('fill', 'none')
        .attr('stroke', '#00D9FF')
        .attr('stroke-width', 1.6)
        .attr('opacity', 0.8);
      q.append('animate').attr('attributeName', 'r').attr('values', '7;11;7').attr('dur', '1.6s').attr('repeatCount', 'indefinite');
      q.append('animate').attr('attributeName', 'opacity').attr('values', '0.8;0;0.8').attr('dur', '1.6s').attr('repeatCount', 'indefinite');
    }
  }, [laidOut, laidOutById, tree, searchPath, searchSet, dims]);

  const tooltipNode = tooltip.nodeId !== null ? byId.get(tooltip.nodeId) : null;
  const tooltipActive = tooltip.nodeId !== null ? searchSet.has(tooltip.nodeId) : false;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden border-r border-line bg-bg-0">
      {/* ambient radial glows */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 25% 15%, rgba(118,185,0,0.05), transparent 45%), radial-gradient(circle at 80% 80%, rgba(0,217,255,0.04), transparent 45%)',
        }}
      />

      <div className="absolute top-0 left-0 right-0 h-[38px] flex items-center px-4 z-10 pointer-events-none">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-low pointer-events-auto">
          Ultrametric Dendrogram — p = 2
        </span>
      </div>

      <span className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 origin-left text-[9.5px] uppercase tracking-[0.12em] text-ink-low font-mono">
        p-Adic Valuation v<sub>p</sub>(x)
      </span>
      <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9.5px] uppercase tracking-[0.12em] text-ink-low font-mono">
        Cluster Branching (X)
      </span>
      <span className="absolute top-[44px] left-3.5 text-[10px] font-mono text-ink-low">
        v<sub>p</sub> = 0 (root — all vectors)
      </span>
      <span className="absolute bottom-3.5 left-3.5 text-[10px] font-mono text-ink-low">
        v<sub>p</sub> = 128 (leaves — individual vectors)
      </span>

      <div className="absolute top-[46px] left-1/2 -translate-x-1/2 z-10 flex gap-3.5 rounded-full border border-line bg-bg-1/85 px-3 py-1.5 backdrop-blur">
        <LegendItem color="#3a3d42" label="inactive" />
        <LegendItem color="#76B900" label="search path" glow />
        <LegendItem color="#00D9FF" label="query node" />
      </div>

      <svg ref={svgRef} width={dims.w} height={dims.h} className="block h-full w-full" />

      {tooltip.visible && tooltipNode && (
        <div
          className="pointer-events-none absolute z-20 min-w-[170px] rounded-[3px] border border-line bg-bg-2 px-2.5 py-2 font-mono text-[10.5px] text-ink-mid shadow-panel"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="mb-1.5 text-[10.5px] font-bold text-gpu-cyan">
            Node #{String(tooltipNode.id).padStart(5, '0')}
          </div>
          <TipRow label="Valuation vₚ" value={valuationForLevel(tooltipNode.level)} />
          <TipRow label="Subtree count" value={tooltipNode.count.toLocaleString()} />
          <TipRow
            label="Dist. to query"
            value={tooltipActive ? Math.pow(2, -valuationForLevel(tooltipNode.level) / 16).toFixed(5) : '—'}
          />
          <TipRow
            label="On search path"
            value={tooltipActive ? 'YES' : 'no'}
            valueClassName={tooltipActive ? 'text-gpu-green' : 'text-ink-low'}
          />
        </div>
      )}

      <OverlayCard position="top-[46px] left-5" swatchColor="#00D9FF" title="Valuation & Norm">
        <MathBlock tex="v_p(x) = \max\{k \in \mathbb{N} : p^k \mid x\}" />
        <div className="mt-1.5">
          <MathBlock tex="|x|_p = p^{-v_p(x)}" />
        </div>
      </OverlayCard>

      <OverlayCard position="top-[46px] right-5" swatchColor="#76B900" title="Ultrametric Distance (p=2)">
        <MathBlock tex="d_2(x,y) = 2^{-\mathrm{CLZ}(x \oplus y)}" />
        <p className="mt-2 text-[10px] leading-relaxed text-ink-low">
          CLZ = Count Leading Zeros — single-clock hardware instruction. Distance is derived without floating point.
        </p>
      </OverlayCard>

      <OverlayCard position="bottom-5 right-5" swatchColor="#FF006E" title="Strong Triangle Inequality">
        <MathBlock tex="d(x,z) \le \max\{\,d(x,y),\, d(y,z)\,\}" />
        <p className="mt-2 text-[10px] leading-relaxed text-ink-low">
          Unlike Euclidean space, <b className="text-gpu-amber">every triangle is isosceles</b> — the two largest
          sides are always equal.
        </p>
      </OverlayCard>
    </div>
  );
}

function LegendItem({ color, label, glow }: { color: string; label: string; glow?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px] text-ink-mid">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: glow ? `0 0 6px ${color}` : undefined }}
      />
      {label}
    </div>
  );
}

function TipRow({
  label,
  value,
  valueClassName = 'text-ink-hi',
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="mb-0.5 flex justify-between gap-3.5 last:mb-0">
      <span>{label}</span>
      <b className={`font-semibold ${valueClassName}`}>{value}</b>
    </div>
  );
}

function OverlayCard({
  position,
  swatchColor,
  title,
  children,
}: {
  position: string;
  swatchColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute z-10 max-w-[270px] rounded border border-line bg-bg-1/90 px-3.5 py-3 shadow-panel backdrop-blur-sm ${position}`}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-low">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: swatchColor }} />
        {title}
      </div>
      <div className="text-ink-hi">{children}</div>
    </div>
  );
}
