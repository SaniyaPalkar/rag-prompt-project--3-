import mongoose from "mongoose";

// One uploaded file (PDF, photo, audio, text) in a user's library.
const docSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    docId: { type: String, required: true },
    filename: { type: String, required: true },
    kind: { type: String, enum: ["pdf", "image", "audio", "text"], required: true },
    lectureDate: { type: String, default: null },
    storedName: { type: String, required: true }, // name on disk inside uploads/<userId>/
    chunkCount: { type: Number, default: 0 },
    conceptCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
docSchema.index({ userId: 1, docId: 1 }, { unique: true });
docSchema.index({ userId: 1, createdAt: -1 });

export const Doc = mongoose.model("Doc", docSchema);