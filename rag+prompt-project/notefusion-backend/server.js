import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { config } from "./src/config.js";
import { connectDb } from "./src/db.js";
import { requireAuth } from "./src/middleware/auth.js";
import { checkProvider, listModels } from "./src/services/llm.js";
import authRoutes from "./src/routes/auth.js";
import chatRoutes from "./src/routes/chat.js";
import libraryRoutes from "./src/routes/library.js";
import graphRoutes from "./src/routes/graph.js";

// Log instead of dying silently, so a crash shows its reason in this terminal.
process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

await connectDb();

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// public
app.get("/api/health", async (_req, res) => {
  const { error } = await listModels().catch((err) => ({ error: err.message }));
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1,
    provider: config.provider,
    llmReady: config.provider === "ollama" ? !error : Boolean(config.openrouterKey),
    audioEnabled: Boolean(config.groqKey),
  });
});
app.use("/api/auth", authRoutes);

// everything else under /api needs a logged-in user (files are served from here too: /api/files/:docId)
const protectedApi = express.Router();
protectedApi.use(requireAuth);
protectedApi.use(chatRoutes);
protectedApi.use(libraryRoutes);
protectedApi.use(graphRoutes);
app.use("/api", protectedApi);

app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.name === "MulterError" ? 400 : 500);
  res.status(status).json({ error: err.message || "Server error" });
});

const server = app.listen(config.port, () => {
  console.log(`NoteFusion backend running on http://localhost:${config.port}`);
  checkProvider();
});

// Node closes idle keep-alive sockets after 5s, but the Vite proxy reuses them.
// That race produces "read ECONNRESET". Keep sockets open longer than the proxy does.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
// Uploads run OCR/LLM calls and can take minutes, so do not cut the request off.
server.requestTimeout = 0;