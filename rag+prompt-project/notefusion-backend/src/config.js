import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const dataDir = path.join(ROOT, "data");
const uploadDir = path.join(ROOT, "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

// Signing key for login tokens. Set JWT_SECRET in .env for production.
// If it is missing, generate one once and keep it so logins survive restarts.
function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, "jwt-secret.txt");
  try {
    const saved = fs.readFileSync(file, "utf8").trim();
    if (saved) return saved;
  } catch {
    /* no saved secret yet */
  }
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  console.warn("JWT_SECRET is not set. Generated one and saved it to data/jwt-secret.txt (set JWT_SECRET in .env for production).");
  return secret;
}

// Which engine writes answers: "ollama" (local, private) or "openrouter" (cloud).
// If LLM_PROVIDER is not set: OpenRouter when a key exists, otherwise Ollama.
const provider = (process.env.LLM_PROVIDER || (process.env.OPENROUTER_API_KEY ? "openrouter" : "ollama")).toLowerCase();
const isOllama = provider === "ollama";

const chatModel = process.env.CHAT_MODEL || (isOllama ? "llama3.2" : "openrouter/free");

export const config = {
  port: Number(process.env.PORT) || 5000,
  isProd: process.env.NODE_ENV === "production",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/notefusion",
  jwtSecret: loadJwtSecret(),
  provider,
  // 127.0.0.1 on purpose: "localhost" can resolve to IPv6 on Windows, where Ollama is not listening
  ollamaUrl: (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, ""),
  // Ollama's default context window is small and silently cuts long prompts, so ask for more
  ollamaNumCtx: Number(process.env.OLLAMA_NUM_CTX) || 8192,
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE || "10m",
  openrouterKey: process.env.OPENROUTER_API_KEY,
  chatModel,
  extractModel: process.env.EXTRACT_MODEL || chatModel,
  visionModel: process.env.VISION_MODEL || (isOllama ? "llama3.2-vision" : "openrouter/free"),
  groqKey: process.env.GROQ_API_KEY || "",
  dataDir,
  uploadDir,
};