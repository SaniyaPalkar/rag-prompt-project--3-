import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { config } from "../config.js";
import { describeImage } from "./llm.js";
import { chunkText } from "./chunker.js";
import { embedMany } from "./embeddings.js";
import { extractConcepts, extractConceptsBatch } from "./concepts.js";

const AUDIO_EXT = [".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac", ".mp4"];

function detectKind(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype === "application/pdf" || ext === ".pdf") return "pdf";
  if (file.mimetype.startsWith("image/")) return "image";
  if (file.mimetype.startsWith("audio/") || AUDIO_EXT.includes(ext)) return "audio";
  if (file.mimetype.startsWith("text/") || [".txt", ".md"].includes(ext)) return "text";
  throw new Error(`Unsupported file type: ${file.originalname}`);
}

async function transcribeAudio(buffer, file) {
  if (!config.groqKey) {
    throw new Error("Audio needs GROQ_API_KEY in .env (free key from console.groq.com). Or upload a transcript as .txt.");
  }
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: file.mimetype }), file.originalname);
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "text");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.groqKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.text();
}

async function extractText(buffer, kind, file) {
  if (kind === "pdf") return (await pdf(buffer)).text;
  if (kind === "image") return describeImage(buffer, file.mimetype);
  if (kind === "audio") return transcribeAudio(buffer, file);
  return buffer.toString("utf8");
}

async function mapPool(list, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) await fn(list[next++]);
  });
  await Promise.all(workers);
}

// `data` is the current user's { userId, vectors, graph, library } from getUserData().
export async function ingestFile(file, data, { lectureDate = null } = {}) {
  const { vectors, graph, library } = data;
  const buffer = await fs.promises.readFile(file.path);
  const kind = detectKind(file);

  const text = await extractText(buffer, kind, file);
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error(`No readable text found in ${file.originalname}`);

  const docId = randomUUID().slice(0, 8);
  const embeddings = await embedMany(chunks);
  const items = chunks.map((t, i) => ({ id: `${docId}-${i}`, docId, index: i, text: t, embedding: embeddings[i] }));

  try {
    await vectors.add(items);

    // knowledge graph: document and chunk nodes
    graph.upsertNode("doc:" + docId, { type: "doc", label: file.originalname, kind });
    for (const it of items) {
      graph.upsertNode("chunk:" + it.id, { type: "chunk", docId });
      graph.link("chunk:" + it.id, "doc:" + docId, "IN_DOC");
    }

    // knowledge graph: concepts and relations.
    // Passages are sent 3 at a time to save API calls. A failure here must not lose the upload.
    const seen = new Set();
    const problems = []; // why extraction failed, shown to the user
    const empty = { concepts: [], relations: [] };

    const applyToGraph = (it, { concepts, relations }) => {
      const ids = new Map();
      for (const c of concepts) {
        const id = graph.touchConcept(c);
        if (id) ids.set(c.toLowerCase(), id);
      }
      for (const id of new Set(ids.values())) {
        graph.link("chunk:" + it.id, id, "MENTIONS");
        seen.add(id);
      }
      for (const r of relations) {
        const a = ids.get(r.from.toLowerCase());
        const b = ids.get(r.to.toLowerCase());
        if (a && b) graph.link(a, b, r.type);
      }
    };

    // Local models are more reliable one passage at a time, and have no per-request cost.
    const BATCH_SIZE = config.provider === "ollama" ? 1 : 3;
    const groups = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) groups.push(items.slice(i, i + BATCH_SIZE));

    await mapPool(groups, 2, async (group) => {
      let results = null;
      if (group.length > 1) {
        try {
          results = await extractConceptsBatch(group.map((g) => g.text));
        } catch (err) {
          console.warn(`Concept extraction failed for ${group[0].id}: ${err.message}`);
          problems.push(err.message);
          results = group.map(() => empty); // likely a rate limit, so do not retry call by call
        }
      }
      if (!results) {
        // single passage, or the model answered a batch in the wrong shape: ask one passage at a time
        results = [];
        for (const it of group) {
          try {
            results.push(await extractConcepts(it.text));
          } catch (err) {
            console.warn(`Concept extraction failed for ${it.id}: ${err.message}`);
            problems.push(err.message);
            results.push(empty);
          }
        }
      }
      group.forEach((it, i) => applyToGraph(it, results[i]));
    });
    await graph.persist();

    const doc = await library.add({
      id: docId,
      filename: file.originalname,
      kind,
      lectureDate,
      storedName: path.basename(file.path),
      chunkCount: chunks.length,
      conceptCount: seen.size,
    });

    // an empty graph is not an error (the file is still searchable), but the user should know why
    let warning = null;
    if (seen.size === 0) {
      const why = problems.length ? `: ${[...new Set(problems)][0]}` : " (the model returned no usable concepts)";
      warning = `Concept extraction produced nothing${why}. The file is searchable, but has no graph links. A larger EXTRACT_MODEL usually fixes this.`;
    }
    return { ...doc, warning };
  } catch (err) {
    // do not leave half-saved passages or graph nodes behind
    await vectors.removeDoc(docId).catch(() => {});
    await graph.removeDoc(docId).catch(() => {});
    throw err;
  }
}