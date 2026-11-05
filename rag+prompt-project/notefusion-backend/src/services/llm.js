import { config } from "../config.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OLLAMA = config.provider === "ollama";

const VISION_PROMPT = `You are reading a student's study material (handwritten notes, a whiteboard photo, or a textbook page).
1. TRANSCRIPTION: write out all handwritten and printed text as faithfully as possible, keeping headings and bullet structure.
2. DIAGRAMS: for every diagram, figure, table, graph or formula, describe what it shows, its labels, and how its parts relate.
Return plain text with those two section titles. Do not add information that is not on the page.`;

/* ===================== Ollama (local) ===================== */

const unreachable = () =>
  new Error(`Cannot reach Ollama at ${config.ollamaUrl}. Open the Ollama app (or run "ollama serve") and try again.`);

// Uses Ollama's own /api/chat because it lets us set the context window (num_ctx).
// The reply is streamed, so a slow local model never hits a fetch timeout.
async function ollamaChat({ model, messages, temperature, maxTokens, json }) {
  let res;
  try {
    res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        keep_alive: config.ollamaKeepAlive,
        ...(json ? { format: "json" } : {}),
        options: { temperature, num_ctx: config.ollamaNumCtx, num_predict: maxTokens },
      }),
    });
  } catch {
    throw unreachable();
  }

  if (!res.ok) {
    const raw = await res.text();
    let msg = raw;
    try {
      msg = JSON.parse(raw).error || raw;
    } catch {
      /* not JSON */
    }
    if (res.status === 404) throw new Error(`${msg}. Install it with: ollama pull ${model}`);
    throw new Error(`Ollama ${res.status}: ${String(msg).slice(0, 300)}`);
  }

  // newline-delimited JSON: one small object per piece of text
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  const take = (line) => {
    if (!line.trim()) return;
    const obj = JSON.parse(line);
    if (obj.error) throw new Error(`Ollama: ${obj.error}`);
    out += obj.message?.content || "";
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      take(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  take(buffer);

  // some reasoning models put their thinking in <think> tags
  out = out.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!out) throw new Error("Ollama returned an empty response");
  return out;
}

/* ===================== OpenRouter (cloud) ===================== */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Free model slugs change often. If one disappears (404), retry on the free router.
const FALLBACK_MODEL = "openrouter/free";

async function postOpenRouter(body, retries = 3) {
  if (!config.openrouterKey) throw new Error("OPENROUTER_API_KEY is not set in .env");
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:5173",
          "X-Title": "NoteFusion AI",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
        lastError = new Error("Model returned an empty response");
      } else if (res.status === 404 && body.model !== FALLBACK_MODEL) {
        console.warn(`Model "${body.model}" is unavailable. Falling back to ${FALLBACK_MODEL}.`);
        body = { ...body, model: FALLBACK_MODEL };
        lastError = new Error(`Model unavailable: ${body.model}`);
      } else if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`OpenRouter ${res.status} (rate limit or server error)`);
      } else {
        throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
    } catch (err) {
      if (err.message.startsWith("OpenRouter 4")) throw err; // client errors: do not retry
      lastError = err;
    }
    if (attempt < retries) await sleep(1500 * (attempt + 1));
  }
  throw lastError;
}

/* ===================== public API ===================== */

// json: ask for strict JSON output (used for concept extraction; Ollama only)
export function chat({ model = config.chatModel, messages, temperature = 0.3, maxTokens = 1200, json = false }) {
  if (OLLAMA) return ollamaChat({ model, messages, temperature, maxTokens, json });
  return postOpenRouter({ model, messages, temperature, max_tokens: maxTokens });
}

export function describeImage(buffer, mime) {
  if (OLLAMA) {
    return ollamaChat({
      model: config.visionModel,
      temperature: 0,
      maxTokens: 1500,
      json: false,
      messages: [{ role: "user", content: VISION_PROMPT, images: [buffer.toString("base64")] }],
    });
  }
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  return postOpenRouter({
    model: config.visionModel,
    temperature: 0,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });
}

/* ===================== model list ===================== */

const OPENROUTER_MODELS = [
  { id: "openrouter/free", label: "Auto (free)" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra" },
];

let tagsCache = { at: 0, models: [], error: null };

// Models the user can pick in the chat box. For Ollama these are the models installed on this machine.
export async function listModels() {
  if (!OLLAMA) {
    const models = OPENROUTER_MODELS.some((m) => m.id === config.chatModel)
      ? OPENROUTER_MODELS
      : [{ id: config.chatModel, label: config.chatModel }, ...OPENROUTER_MODELS];
    return { models, error: null };
  }
  if (!tagsCache.error && Date.now() - tagsCache.at < 15_000) return tagsCache;
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    const models = (data.models || [])
      .filter((m) => !/bert/i.test(m.details?.family || "") && !/embed/i.test(m.name)) // hide embedding-only models
      .map((m) => ({ id: m.name, label: m.name }));
    tagsCache = { at: Date.now(), models, error: null };
  } catch {
    tagsCache = { at: 0, models: [], error: unreachable().message };
  }
  return tagsCache;
}

// Ollama lists "llama3.2:latest" even when you wrote "llama3.2", so match both spellings.
const findInstalled = (models, name) => {
  const wanted = name.includes(":") ? name : `${name}:latest`;
  return models.find((m) => m.id === name || m.id === wanted)?.id;
};

// The default shown in the dropdown: the configured model if installed, otherwise the first installed one.
export function pickDefault(models) {
  if (!OLLAMA) return config.chatModel;
  return findInstalled(models, config.chatModel) || models[0]?.id || config.chatModel;
}

// Only accept a model name the provider actually has; anything else falls back to the default.
export async function resolveModel(requested) {
  const { models } = await listModels();
  if (typeof requested !== "string" || !requested) return pickDefault(models);
  if (!OLLAMA) return requested;
  return findInstalled(models, requested) || pickDefault(models);
}

// Printed once at startup so a missing model is obvious.
export async function checkProvider() {
  if (!OLLAMA) {
    if (!config.openrouterKey) console.warn("WARNING: OPENROUTER_API_KEY is missing. Copy .env.example to .env and set it.");
    else console.log(`LLM provider: OpenRouter (${config.chatModel})`);
    return;
  }
  const { models, error } = await listModels();
  if (error) return console.warn(`WARNING: ${error}`);
  console.log(`LLM provider: Ollama at ${config.ollamaUrl} (${models.length} models installed)`);
  const needed = [
    ["CHAT_MODEL", config.chatModel],
    ["EXTRACT_MODEL", config.extractModel],
    ["VISION_MODEL", config.visionModel],
  ];
  const seen = new Set();
  for (const [name, model] of needed) {
    if (findInstalled(models, model) || seen.has(model)) continue;
    seen.add(model);
    console.warn(`WARNING: ${name}=${model} is not installed. Run "ollama pull ${model}" or set ${name} in .env to one of: ${models.map((m) => m.id).join(", ") || "(none installed)"}`);
  }
}