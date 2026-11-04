import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    sources: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    concepts: { type: [String], default: undefined },
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    title: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);
chatSchema.index({ userId: 1, updatedAt: -1 });

export const Chat = mongoose.model("Chat", chatSchema);