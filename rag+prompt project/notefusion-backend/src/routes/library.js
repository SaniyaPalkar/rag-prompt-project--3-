import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { ingestFile } from "../services/ingest.js";
import { getUserData } from "../services/userData.js";

const router = Router();

// Each user's files live in uploads/<userId>/ and are never served by path.
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(config.uploadDir, req.user.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024, files: 10 } });

// Upload notes photos, PDFs, audio, text. Optional field: lectureDate (YYYY-MM-DD)
router.post("/upload", upload.array("files", 10), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: "No files uploaded (field name: files)" });
    const rawDate = String(req.body?.lectureDate || "");
    const lectureDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
    const data = await getUserData(req.user.id);

    const documents = [];
    const errors = [];
    for (const file of req.files) {
      try {
        documents.push(await ingestFile(file, data, { lectureDate }));
      } catch (err) {
        errors.push({ filename: file.originalname, error: err.message });
        fs.promises.unlink(file.path).catch(() => {});
      }
    }
    res.status(documents.length ? 200 : 422).json({ documents, errors });
  } catch (err) {
    next(err);
  }
});

router.get("/library", async (req, res, next) => {
  try {
    res.json(await (await getUserData(req.user.id)).library.list());
  } catch (err) {
    next(err);
  }
});

// Open a file. Ownership is checked in the database: the record must belong to this user.
// Someone else's docId gets the same 404 as one that does not exist.
router.get("/files/:docId", async (req, res, next) => {
  try {
    const doc = await (await getUserData(req.user.id)).library.getRaw(String(req.params.docId));
    if (!doc) return res.status(404).json({ error: "File not found" });

    // uploads are untrusted: stop the browser from running anything inside them
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Cache-Control", "private, max-age=0");
    res.sendFile(path.join(config.uploadDir, req.user.id, path.basename(doc.storedName)), { dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "File not found" });
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/library/:id", async (req, res, next) => {
  try {
    const data = await getUserData(req.user.id);
    const docId = String(req.params.id);
    const doc = await data.library.getRaw(docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    await data.vectors.removeDoc(docId);
    await data.graph.removeDoc(docId);
    await data.library.remove(docId);
    await fs.promises.unlink(path.join(config.uploadDir, req.user.id, path.basename(doc.storedName))).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;