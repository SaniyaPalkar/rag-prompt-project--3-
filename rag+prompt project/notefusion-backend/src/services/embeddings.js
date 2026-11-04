// Local embeddings (free, no API key). The model (~25 MB) downloads on first use.
let extractorPromise;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import("@xenova/transformers").then(({ pipeline }) =>
      pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")
    );
  }
  return extractorPromise;
}

export async function embed(text) {
  const extractor = await getExtractor();
  const out = await extractor(text.slice(0, 2000), { pooling: "mean", normalize: true });
  return Array.from(out.data, (x) => Math.round(x * 1e5) / 1e5);
}

export async function embedMany(texts) {
  const result = [];
  for (const t of texts) result.push(await embed(t));
  return result;
}
