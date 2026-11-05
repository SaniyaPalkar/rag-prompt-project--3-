import { chat } from "./llm.js";
import { config } from "../config.js";

const ALLOWED = new Set(["RELATED_TO", "PREREQUISITE_OF", "PART_OF", "EXAMPLE_OF"]);

const RULES = `Rules:
- 3 to 8 concepts per passage. Each is a short noun phrase (1-4 words), such as "raster compression" or "round robin scheduling". Never a sentence.
- Use the standard textbook name for a concept, so the same idea gets the same name across different passages.
- "relations" connect concepts from the same passage's own list only. type is one of RELATED_TO, PREREQUISITE_OF (from must be understood before to), PART_OF, EXAMPLE_OF.
- Even short or formula-heavy passages have concepts: name the topic, the method and the key terms.
- Only if a passage is completely empty of study content, give it {"concepts":[],"relations":[]}.`;

const SINGLE_SYSTEM = `You build a knowledge graph from study notes.
Return ONLY a JSON object, no explanation, in exactly this shape:
{"concepts":["..."],"relations":[{"from":"...","to":"...","type":"RELATED_TO"}]}

${RULES}

Example
Passage: Round robin scheduling gives every process a fixed time slice. A process that has not finished goes to the back of the ready queue.
Answer: {"concepts":["round robin scheduling","time slice","ready queue"],"relations":[{"from":"time slice","to":"round robin scheduling","type":"PART_OF"},{"from":"ready queue","to":"round robin scheduling","type":"RELATED_TO"}]}`;

const BATCH_SYSTEM = `You build a knowledge graph from study notes. You receive several passages, each starting with "### PASSAGE n".
Return ONLY a JSON object, no explanation, with exactly one entry per passage in the same order:
{"passages":[{"concepts":["..."],"relations":[{"from":"...","to":"...","type":"RELATED_TO"}]}]}

${RULES}`;

// Finds the JSON object (or array) inside the model's reply, even if it added extra words around it.
function parseJson(raw) {
  const firstObj = raw.indexOf("{");
  const firstArr = raw.indexOf("[");
  const start = firstObj < 0 ? firstArr : firstArr < 0 ? firstObj : Math.min(firstObj, firstArr);
  if (start < 0) return null;
  const end = raw.lastIndexOf(raw[start] === "{" ? "}" : "]");
  if (end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Small models sometimes answer with objects like {"name": "..."} instead of plain strings.
const asName = (c) =>
  typeof c === "string" ? c : c && typeof c === "object" ? String(c.name || c.concept || c.term || c.label || c.title || "") : "";

// Validate one passage's result: dedupe, cap, and keep relations between known concepts only.
function clean(json) {
  if (!json || typeof json !== "object") return { concepts: [], relations: [] };
  const list = json.concepts ?? json.key_concepts ?? json.keywords ?? json.topics ?? json.terms ?? [];
  const concepts = [
    ...new Set((Array.isArray(list) ? list : []).map((c) => asName(c).trim()).filter((c) => c && c.length <= 50)),
  ].slice(0, 8);
  const known = new Set(concepts.map((c) => c.toLowerCase()));

  const relations = (Array.isArray(json.relations) ? json.relations : [])
    .map((r) => (r && typeof r === "object" ? { from: asName(r.from), to: asName(r.to), type: String(r.type || "").toUpperCase() } : null))
    .filter((r) => r && known.has(r.from.toLowerCase()) && known.has(r.to.toLowerCase()))
    .map((r) => ({ from: r.from, to: r.to, type: ALLOWED.has(r.type) ? r.type : "RELATED_TO" }));

  return { concepts, relations };
}

const snippet = (raw) => raw.replace(/\s+/g, " ").trim().slice(0, 90);

// One passage per call. Throws (with the model's own words) when the reply is not usable,
// so the upload can tell the user why the graph came out empty.
export async function extractConcepts(text) {
  const raw = await chat({
    model: config.extractModel,
    temperature: 0,
    json: true,
    maxTokens: 500,
    messages: [
      { role: "system", content: SINGLE_SYSTEM },
      { role: "user", content: `Passage: ${text.slice(0, 3000)}\nAnswer:` },
    ],
  });
  const json = parseJson(raw);
  if (!json) {
    console.warn(`Concept extraction: model reply was not JSON: ${snippet(raw)}`);
    throw new Error(`the model did not return JSON (it said: "${snippet(raw)}")`);
  }
  return clean(json);
}

// Several passages per call. Returns an array aligned with `texts`,
// or null if the model's answer was not usable (caller can fall back).
export async function extractConceptsBatch(texts) {
  const user = texts.map((t, i) => `### PASSAGE ${i + 1}\n${t.slice(0, 1500)}`).join("\n\n");
  const raw = await chat({
    model: config.extractModel,
    temperature: 0,
    json: true,
    maxTokens: 400 * texts.length + 200,
    messages: [
      { role: "system", content: BATCH_SYSTEM },
      { role: "user", content: user },
    ],
  });
  const json = parseJson(raw);
  const list = Array.isArray(json) ? json : json?.passages;
  if (!Array.isArray(list) || list.length !== texts.length) return null;
  return list.map(clean);
}