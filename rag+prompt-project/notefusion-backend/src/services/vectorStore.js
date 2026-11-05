import { Chunk } from "../models/Chunk.js";

// Embeddings are normalized, so dot product == cosine similarity.
export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

const toItem = (c) => ({ id: c.chunkId, docId: c.docId, index: c.index, text: c.text, embedding: c.embedding });

// Every query includes { userId }, so one user can never read another user's passages.
export function createVectorStore(userId) {
  return {
    async add(items) {
      await Chunk.insertMany(
        items.map((i) => ({ userId, docId: i.docId, chunkId: i.id, index: i.index, text: i.text, embedding: i.embedding }))
      );
    },

    async getMany(chunkIds) {
      if (!chunkIds.length) return [];
      const rows = await Chunk.find({ userId, chunkId: { $in: chunkIds } }).lean();
      return rows.map(toItem);
    },

    // Score this user's vectors in Node (fine at personal-library scale), then load the text of the top k only.
    async search(queryEmbedding, k = 5) {
      const rows = await Chunk.find({ userId }).select("chunkId embedding").lean();
      const top = rows
        .map((r) => ({ chunkId: r.chunkId, score: cosine(queryEmbedding, r.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
      const items = new Map((await this.getMany(top.map((t) => t.chunkId))).map((i) => [i.id, i]));
      return top.filter((t) => items.has(t.chunkId)).map((t) => ({ item: items.get(t.chunkId), score: t.score }));
    },

    async removeDoc(docId) {
      await Chunk.deleteMany({ userId, docId });
    },

    count: () => Chunk.countDocuments({ userId }),
  };
}