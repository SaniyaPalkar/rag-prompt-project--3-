import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { RefreshCw, Search, X } from "lucide-react";

const radius = (n) => (n.type === "doc" ? 7 : 3 + Math.sqrt(n.size || 1) * 2.2);
const short = (s, n = 26) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const endId = (e) => (typeof e === "object" ? e.id : e);

export default function GraphView() {
  const wrapRef = useRef(null);
  const fgRef = useRef(null);
  const fitted = useRef(false);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [raw, setRaw] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDocs, setShowDocs] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/graph");
      if (!res.ok) throw new Error("Could not load the graph");
      setRaw(await res.json());
      fitted.current = false;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // keep the canvas the size of its container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // force-graph mutates the objects it receives, so give it copies
  const graphData = useMemo(() => {
    const nodes = raw.nodes.filter((n) => showDocs || n.type !== "doc").map((n) => ({ ...n }));
    const ids = new Set(nodes.map((n) => n.id));
    const links = raw.links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ ...l }));
    return { nodes, links };
  }, [raw, showDocs]);

  const byId = useMemo(() => new Map(raw.nodes.map((n) => [n.id, n])), [raw]);

  const highlight = useMemo(() => {
    if (selectedId) {
      const s = new Set([selectedId]);
      raw.links.forEach((l) => {
        if (l.source === selectedId) s.add(l.target);
        if (l.target === selectedId) s.add(l.source);
      });
      return s;
    }
    const q = query.trim().toLowerCase();
    if (q) return new Set(raw.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
    return null;
  }, [selectedId, query, raw]);

  const detail = useMemo(() => {
    const node = selectedId && byId.get(selectedId);
    if (!node) return null;
    const related = [];
    raw.links.forEach((l) => {
      if (l.source === node.id) related.push(byId.get(l.target));
      else if (l.target === node.id) related.push(byId.get(l.source));
    });
    const valid = related.filter(Boolean);
    return {
      node,
      concepts: valid.filter((n) => n.type === "concept").sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 24),
      docs: valid.filter((n) => n.type === "doc"),
    };
  }, [selectedId, byId, raw]);

  const counts = useMemo(
    () => ({
      concepts: raw.nodes.filter((n) => n.type === "concept").length,
      docs: raw.nodes.filter((n) => n.type === "doc").length,
      links: raw.links.filter((l) => l.type !== "MENTIONS").length,
    }),
    [raw]
  );

  const paintNode = (node, ctx, scale) => {
    const isDoc = node.type === "doc";
    const r = radius(node);
    const dim = highlight && !highlight.has(node.id);

    ctx.globalAlpha = dim ? 0.15 : 1;
    ctx.fillStyle = isDoc ? "#f0abfc" : "#8b5cf6";
    if (node.id === selectedId) {
      ctx.shadowColor = "#c084fc";
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    if (isDoc) ctx.rect(node.x - r, node.y - r, r * 2, r * 2);
    else ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;

    const showLabel = isDoc || scale > 1.4 || (node.size || 1) >= 3 || (highlight && highlight.has(node.id));
    if (showLabel) {
      ctx.font = `${(isDoc ? 12 : 11) / scale}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(short(node.label), node.x, node.y + r + 2 / scale);
    }
    ctx.globalAlpha = 1;
  };

  const paintPointer = (node, color, ctx) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius(node) + 2, 0, 2 * Math.PI);
    ctx.fill();
  };

  const linkColor = (l) => {
    const inFocus = !highlight || (highlight.has(endId(l.source)) && highlight.has(endId(l.target)));
    if (!inFocus) return "rgba(255,255,255,0.04)";
    return l.type === "MENTIONS" ? "rgba(240,171,252,0.2)" : "rgba(167,139,250,0.55)";
  };

  const isEmpty = !loading && !error && counts.concepts === 0;

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      {size.w > 0 && !isEmpty && (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          backgroundColor="rgba(0,0,0,0)"
          autoPauseRedraw={false}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointer}
          linkColor={linkColor}
          linkWidth={(l) => (l.type === "MENTIONS" ? 0.6 : 1 + Math.min(l.weight || 1, 4) * 0.4)}
          linkDirectionalArrowLength={(l) => (l.type === "PREREQUISITE_OF" ? 4 : 0)}
          linkDirectionalArrowRelPos={1}
          cooldownTicks={120}
          onEngineStop={() => {
            if (!fitted.current) {
              fitted.current = true;
              fgRef.current?.zoomToFit(400, 90);
            }
          }}
          onNodeClick={(n) => setSelectedId(n.id)}
          onBackgroundClick={() => setSelectedId(null)}
        />
      )}

      {/* top bar */}
      <div className="absolute left-0 right-0 top-0 flex items-start justify-between gap-4 p-6">
        <div>
          <h1 className="text-xl font-medium">Knowledge Graph</h1>
          <p className="mt-1 text-sm text-white/50">
            {counts.concepts} concepts, {counts.docs} documents, {counts.links} links between concepts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#1c1c20] px-3 py-2">
            <Search size={14} className="text-white/40" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId(null);
              }}
              placeholder="Find a concept"
              className="w-40 bg-transparent text-sm outline-none placeholder-white/40"
            />
          </div>
          <button
            onClick={() => setShowDocs((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-sm ${
              showDocs ? "border-violet-400/60 bg-violet-500/20 text-white" : "border-white/10 bg-[#1c1c20] text-white/60"
            }`}
          >
            Documents
          </button>
          <button
            onClick={load}
            title="Reload graph"
            className="rounded-xl border border-white/10 bg-[#1c1c20] p-2.5 text-white/60 hover:text-white"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* legend */}
      {!isEmpty && (
        <div className="absolute bottom-6 left-6 space-y-1.5 rounded-xl border border-white/10 bg-[#1c1c20]/90 px-4 py-3 text-xs text-white/60">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-violet-500" /> Concept (bigger means mentioned more)
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 bg-fuchsia-300" /> Document
          </div>
          <div className="flex items-center gap-2">
            <span className="h-px w-3 bg-violet-300" /> Related concepts (arrow: learn first)
          </div>
        </div>
      )}

      {/* detail panel */}
      {detail && (
        <div className="absolute right-6 top-24 max-h-[70%] w-72 overflow-y-auto rounded-2xl border border-white/10 bg-[#1c1c20]/95 p-4 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-white/40">{detail.node.type === "doc" ? "Document" : "Concept"}</div>
              <div className="text-base font-medium">{detail.node.label}</div>
            </div>
            <button onClick={() => setSelectedId(null)} className="text-white/40 hover:text-white">
              <X size={16} />
            </button>
          </div>

          {detail.docs.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-xs text-white/40">Found in</div>
              <div className="flex flex-wrap gap-1.5">
                {detail.docs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-2.5 py-1 text-xs text-fuchsia-100"
                  >
                    {short(d.label, 22)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {detail.concepts.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs text-white/40">
                {detail.node.type === "doc" ? "Main concepts" : "Connected concepts"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.concepts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-100 hover:bg-violet-500/25"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {detail.concepts.length === 0 && detail.docs.length === 0 && (
            <p className="text-xs text-white/40">No connections yet.</p>
          )}
        </div>
      )}

      {/* empty and error states */}
      {(isEmpty || error) && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <div className="max-w-sm">
            <p className="mb-2 text-lg">{error ? "The graph could not load" : "Your graph is empty"}</p>
            <p className="text-sm text-white/50">
              {error
                ? `${error}. Check that the backend is running on port 5000, then reload.`
                : "Upload a PDF, a notes photo or an audio recording from the Chat page. Concepts and their links appear here once processing finishes."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
