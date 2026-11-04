export function chunkText(text, { size = 900, overlap = 150 } = {}) {
  const clean = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return [];

  const chunks = [];
  let cur = "";
  for (const para of clean.split(/\n\n+/)) {
    if (!cur) {
      cur = para;
    } else if (cur.length + 2 + para.length <= size) {
      cur += "\n\n" + para;
    } else {
      chunks.push(cur);
      cur = cur.slice(-overlap) + "\n\n" + para;
    }
    while (cur.length > size * 1.5) {
      chunks.push(cur.slice(0, size));
      cur = cur.slice(size - overlap);
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.map((c) => c.trim()).filter((c) => c.length > 30);
}
