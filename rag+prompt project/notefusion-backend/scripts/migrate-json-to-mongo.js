// One-time move of the old JSON-file data into MongoDB.
//   npm run migrate
// Safe to run again: accounts whose email is already in MongoDB are skipped.
// Passwords keep working (the bcrypt hashes are copied as they are).
// The old data/ folder is left untouched as a backup.
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import mongoose from "mongoose";
import { config } from "../src/config.js";
import { connectDb } from "../src/db.js";
import { User } from "../src/models/User.js";
import { Doc } from "../src/models/Doc.js";
import { Chunk } from "../src/models/Chunk.js";
import { Chat } from "../src/models/Chat.js";
import { Graph } from "../src/models/Graph.js";

const read = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

async function migrateUser(old) {
  const user = await User.create({ name: old.name, email: old.email, passwordHash: old.passwordHash });
  const userId = String(user._id);
  const dir = path.join(config.dataDir, "users", old.id);

  try {
    const docs = read(path.join(dir, "docs.json"), []);
    for (const d of docs) {
      await Doc.create({
        userId,
        docId: d.id,
        filename: d.filename,
        kind: d.kind,
        lectureDate: d.lectureDate || null,
        storedName: path.basename(d.fileUrl),
        chunkCount: d.chunkCount || 0,
        conceptCount: d.conceptCount || 0,
        createdAt: new Date(d.uploadedAt || Date.now()),
      });
    }

    const vectors = read(path.join(dir, "vectors.json"), []);
    for (let i = 0; i < vectors.length; i += 500) {
      await Chunk.insertMany(
        vectors.slice(i, i + 500).map((v) => ({
          userId, docId: v.docId, chunkId: v.id, index: v.index, text: v.text, embedding: v.embedding,
        }))
      );
    }

    const graph = read(path.join(dir, "graph.json"), null);
    if (graph) await Graph.create({ userId, nodes: Object.values(graph.nodes || {}), edges: graph.edges || [] });

    // chats keep their original dates, and file links in saved answers point at the new route
    const chats = read(path.join(dir, "chats.json"), []);
    if (chats.length) {
      await Chat.collection.insertMany(
        chats.map((c) => ({
          userId,
          title: c.title,
          pinned: Boolean(c.pinned),
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt),
          messages: (c.messages || []).map((m) => {
            const msg = { role: m.role, content: m.content };
            if (m.sources) {
              msg.sources = m.sources.map((s) => ({
                ...s,
                fileUrl: s.docId ? `/api/files/${s.docId}` : s.fileUrl,
                imageUrl: s.kind === "image" && s.docId ? `/api/files/${s.docId}` : null,
              }));
            }
            if (m.concepts) msg.concepts = m.concepts;
            return msg;
          }),
        }))
      );
    }

    // uploads/<old id>/ becomes uploads/<new id>/
    const oldUploads = path.join(config.uploadDir, old.id);
    if (fs.existsSync(oldUploads)) fs.renameSync(oldUploads, path.join(config.uploadDir, userId));

    return { docs: docs.length, chunks: vectors.length, chats: chats.length };
  } catch (err) {
    // undo this user completely so a re-run starts clean
    await Promise.all([
      Doc.deleteMany({ userId }), Chunk.deleteMany({ userId }), Chat.deleteMany({ userId }),
      Graph.deleteMany({ userId }), User.deleteOne({ _id: user._id }),
    ]);
    throw err;
  }
}

export async function main() {
  const oldUsers = read(path.join(config.dataDir, "users.json"), []);
  if (!oldUsers.length) {
    console.log("No data/users.json found, so there is nothing to migrate.");
    return;
  }
  for (const old of oldUsers) {
    if (await User.findOne({ email: old.email }).lean()) {
      console.log(`Skipping ${old.email}: already in MongoDB`);
      continue;
    }
    try {
      const r = await migrateUser(old);
      console.log(`Migrated ${old.email}: ${r.docs} files, ${r.chunks} passages, ${r.chats} chats`);
    } catch (err) {
      console.error(`Failed for ${old.email}: ${err.message} (changes for this user were undone)`);
    }
  }
}

// run only when started from the command line (not when imported by a test)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await connectDb();
  await main();
  await mongoose.disconnect();
}