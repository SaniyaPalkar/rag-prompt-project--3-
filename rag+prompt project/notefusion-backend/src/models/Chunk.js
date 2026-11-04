import mongoose from "mongoose";

// One passage of text plus its embedding vector.
const chunkSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  docId: { type: String, required: true },
  chunkId: { type: String, required: true }, // "<docId>-<index>"
  index: { type: Number, required: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
});
chunkSchema.index({ userId: 1, chunkId: 1 }, { unique: true });
chunkSchema.index({ userId: 1, docId: 1 });

export const Chunk = mongoose.model("Chunk", chunkSchema);