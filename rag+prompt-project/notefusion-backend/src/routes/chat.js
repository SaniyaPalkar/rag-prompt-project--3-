import { Router } from "express";
import { chat, listModels, pickDefault, resolveModel } from "../services/llm.js";
import { retrieve } from "../services/retrieval.js";
import { buildMessages } from "../services/prompts.js";
import { getUserData } from "../services/userData.js";
import { config } from "../config.js";

const router = Router();

// Ask a question. Creates a chat if chatId is not given. (req.user is set by requireAuth.)
router.post("/chat", async (req, res, next) => {
  try {
    const { chatId, message, model } = req.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const data = await getUserData(req.user.id);
    // a chatId that is not this user's is treated as "not found", so a new chat starts instead
    const session = (chatId && (await data.chats.get(String(chatId)))) || (await data.chats.create(message));
    const { contexts, concepts } = await retrieve(message, data);

    const answer = await chat({
      model: await resolveModel(model),
      temperature: 0.2,
      messages: buildMessages({ question: message, history: session.messages, contexts, concepts }),
    });

    const sources = contexts.map((c, i) => ({
      n: i + 1,
      docId: c.docId,
      filename: c.filename,
      kind: c.kind,
      lectureDate: c.lectureDate,
      snippet: c.text.slice(0, 220),
      fileUrl: c.fileUrl,
      imageUrl: c.kind === "image" ? c.fileUrl : null,
      via: c.via,
      score: c.score,
    }));

    await data.chats.append(
      session.id,
      { role: "user", content: message },
      { role: "assistant", content: answer, sources, concepts }
    );

    res.json({ chatId: session.id, title: session.title, answer, sources, concepts });
  } catch (err) {
    next(err);
  }
});

// Models for the dropdown (for Ollama: whatever is installed on this machine)
router.get("/models", async (_req, res, next) => {
  try {
    const { models, error } = await listModels();
    res.json({ provider: config.provider, default: pickDefault(models), models, error });
  } catch (err) {
    next(err);
  }
});

// Sidebar history (only this user's chats)
router.get("/chats", async (req, res, next) => {
  try {
    res.json(await (await getUserData(req.user.id)).chats.list());
  } catch (err) {
    next(err);
  }
});

router.get("/chats/:id", async (req, res, next) => {
  try {
    const session = await (await getUserData(req.user.id)).chats.get(req.params.id);
    if (!session) return res.status(404).json({ error: "Chat not found" });
    res.json(session);
  } catch (err) {
    next(err);
  }
});

router.patch("/chats/:id", async (req, res, next) => {
  try {
    const session = await (await getUserData(req.user.id)).chats.update(req.params.id, req.body || {});
    if (!session) return res.status(404).json({ error: "Chat not found" });
    res.json({ id: session.id, title: session.title, pinned: session.pinned });
  } catch (err) {
    next(err);
  }
});

router.delete("/chats/:id", async (req, res, next) => {
  try {
    await (await getUserData(req.user.id)).chats.remove(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;