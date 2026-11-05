import { embed } from "./embeddings.js";
import { cosine } from "./vectorStore.js";

/*
  Hybrid retrieval
  1. Vector search finds the chunks most similar to the question.
  2. The concepts in those chunks (and concepts named in the question) seed the graph.
  3. The graph expands one hop to related concepts, and chunks that mention them are
     added. Chunks from documents not yet represented get a bonus, so an answer can
     pull a lecture note, a handwritten diagram and a textbook page together.
*/
// `data` is the current user's { vectors, graph, library } from getUserData().
export async function retrieve(question, data, { k = 5, extra = 3, minScore = 0.15 } = {}) {
  const { vectors, graph, library } = data;
  const qEmb = await embed(question);

  const hits = (await vectors.search(qEmb, k)).filter((h) => h.score >= minScore);
  const picked = new Map();
  for (const h of hits) picked.set(h.item.id, { item: h.item, score: h.score, via: "vector" });

  const seeds = new Set();
  for (const h of hits) graph.conceptsOfChunk(h.item.id).forEach((c) => seeds.add(c));
  graph.findConceptsInText(question).forEach((c) => seeds.add(c));

  const expanded = new Set(seeds);
  for (const c of seeds) graph.relatedConcepts(c).forEach((r) => expanded.add(r.id));

  // chunks that mention an expanded concept, with how many concepts they share
  const shared = new Map();
  for (const c of expanded) {
    for (const chunkId of graph.chunksOfConcept(c)) {
      if (!picked.has(chunkId)) shared.set(chunkId, (shared.get(chunkId) || 0) + 1);
    }
  }
  const candidateItems = await vectors.getMany([...shared.keys()].slice(0, 300));

  const pickedDocs = new Set([...picked.values()].map((p) => p.item.docId));
  const graphPicks = candidateItems
    .map((item) => {
      const sim = cosine(qEmb, item.embedding);
      const bonus = pickedDocs.has(item.docId) ? 0 : 0.15;
      return { item, sim, rank: sim + (shared.get(item.id) || 0) * 0.05 + bonus };
    })
    .filter((c) => c.sim >= minScore * 0.5)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, extra);

  for (const g of graphPicks) picked.set(g.item.id, { item: g.item, score: g.sim, via: "graph" });

  const docIds = [...new Set([...picked.values()].map((p) => p.item.docId))];
  const docs = new Map((await library.getMany(docIds)).map((d) => [d.id, d]));

  const contexts = [...picked.values()].map((p) => {
    const doc = docs.get(p.item.docId);
    return {
      chunkId: p.item.id,
      text: p.item.text,
      score: Number(p.score.toFixed(3)),
      via: p.via,
      docId: p.item.docId,
      filename: doc?.filename || "unknown",
      kind: doc?.kind || "text",
      lectureDate: doc?.lectureDate || null,
      fileUrl: doc?.fileUrl || null,
    };
  });

  const concepts = [...expanded].slice(0, 10).map((id) => graph.label(id));
  return { contexts, concepts };
}