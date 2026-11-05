import { Graph } from "../models/Graph.js";

/*
  Knowledge graph (one per user, kept in memory and saved to MongoDB)
  Nodes : doc:<id>, chunk:<id>, concept:<name>
  Edges : chunk -IN_DOC-> doc
          chunk -MENTIONS-> concept
          concept -RELATED_TO | PREREQUISITE_OF | PART_OF | EXAMPLE_OF-> concept
*/
const CONCEPT_EDGES = new Set(["RELATED_TO", "PREREQUISITE_OF", "PART_OF", "EXAMPLE_OF"]);

export const normalize = (n) =>
  String(n).toLowerCase().replace(/[^\p{L}\p{N}\s+\-]/gu, " ").replace(/\s+/g, " ").trim();
export const conceptId = (name) => "concept:" + normalize(name);

function createGraphStore(userId, initial) {
  const state = {
    nodes: Object.fromEntries((initial.nodes || []).map((n) => [n.id, { ...n }])),
    edges: (initial.edges || []).map((e) => ({ ...e })),
  };
  let index = new Map(state.edges.map((e) => [`${e.from}|${e.to}|${e.type}`, e]));

  // Save the whole graph back to this user's document.
  const persist = () =>
    Graph.updateOne({ userId }, { $set: { nodes: Object.values(state.nodes), edges: state.edges } }, { upsert: true });

  function upsertNode(id, props) {
    if (state.nodes[id]) Object.assign(state.nodes[id], props);
    else state.nodes[id] = { id, ...props };
  }

  function touchConcept(name) {
    const label = normalize(name);
    if (!label) return null;
    const id = "concept:" + label;
    if (!state.nodes[id]) state.nodes[id] = { id, type: "concept", label };
    return id;
  }

  function link(from, to, type) {
    if (from === to) return;
    const key = `${from}|${to}|${type}`;
    const existing = index.get(key);
    if (existing) {
      existing.weight++;
      return;
    }
    const edge = { from, to, type, weight: 1 };
    state.edges.push(edge);
    index.set(key, edge);
  }

  const label = (id) => state.nodes[id]?.label || id;

  function conceptsOfChunk(chunkId) {
    const from = "chunk:" + chunkId;
    return state.edges.filter((e) => e.type === "MENTIONS" && e.from === from).map((e) => e.to);
  }

  function chunksOfConcept(cid) {
    return state.edges.filter((e) => e.type === "MENTIONS" && e.to === cid).map((e) => e.from.slice("chunk:".length));
  }

  function relatedConcepts(cid) {
    const out = [];
    for (const e of state.edges) {
      if (!CONCEPT_EDGES.has(e.type)) continue;
      if (e.from === cid) out.push({ id: e.to, weight: e.weight });
      else if (e.to === cid) out.push({ id: e.from, weight: e.weight });
    }
    return out;
  }

  function findConceptsInText(text) {
    const padded = ` ${normalize(text)} `;
    return Object.values(state.nodes)
      .filter((n) => n.type === "concept" && n.label.length >= 3 && padded.includes(` ${n.label} `))
      .map((n) => n.id);
  }

  async function removeDoc(docId) {
    const gone = new Set(
      Object.values(state.nodes)
        .filter((n) => n.type === "chunk" && n.docId === docId)
        .map((n) => n.id)
    );
    gone.add("doc:" + docId);

    state.edges = state.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
    gone.forEach((id) => delete state.nodes[id]);

    // drop concepts that no remaining chunk mentions
    const mentioned = new Set(state.edges.filter((e) => e.type === "MENTIONS").map((e) => e.to));
    for (const n of Object.values(state.nodes)) {
      if (n.type === "concept" && !mentioned.has(n.id)) delete state.nodes[n.id];
    }
    state.edges = state.edges.filter((e) => state.nodes[e.from] && state.nodes[e.to]);
    index = new Map(state.edges.map((e) => [`${e.from}|${e.to}|${e.type}`, e]));
    await persist();
  }

  // Graph for the visualization page (no chunk nodes, to keep it readable).
  function toGraph() {
    const mentionCount = new Map();
    const chunkDoc = new Map();
    for (const e of state.edges) {
      if (e.type === "MENTIONS") mentionCount.set(e.to, (mentionCount.get(e.to) || 0) + 1);
      if (e.type === "IN_DOC") chunkDoc.set(e.from, e.to);
    }

    const nodes = [];
    for (const n of Object.values(state.nodes)) {
      if (n.type === "concept") nodes.push({ id: n.id, label: n.label, type: "concept", size: mentionCount.get(n.id) || 1 });
      if (n.type === "doc") nodes.push({ id: n.id, label: n.label, type: "doc", kind: n.kind });
    }

    const links = [];
    for (const e of state.edges) {
      if (CONCEPT_EDGES.has(e.type)) links.push({ source: e.from, target: e.to, type: e.type, weight: e.weight });
    }

    const docConcept = new Map();
    for (const e of state.edges) {
      if (e.type !== "MENTIONS") continue;
      const doc = chunkDoc.get(e.from);
      if (!doc) continue;
      const key = `${doc}|${e.to}`;
      docConcept.set(key, (docConcept.get(key) || 0) + 1);
    }
    for (const [key, weight] of docConcept) {
      const [source, target] = key.split("|");
      links.push({ source, target, type: "MENTIONS", weight });
    }

    return { nodes, links };
  }

  return {
    persist, upsertNode, touchConcept, link, label,
    conceptsOfChunk, chunksOfConcept, relatedConcepts, findConceptsInText, removeDoc, toGraph,
  };
}

// Cache one graph per user (as a promise, so two requests at once load it only once).
// This assumes a single backend process.
const cache = new Map();

export function getGraphStore(userId) {
  let pending = cache.get(userId);
  if (!pending) {
    pending = Graph.findOne({ userId })
      .lean()
      .then((doc) => createGraphStore(userId, doc || { nodes: [], edges: [] }))
      .catch((err) => {
        cache.delete(userId);
        throw err;
      });
    cache.set(userId, pending);
  }
  return pending;
}