import mongoose from "mongoose";
import { Chat } from "../models/Chat.js";

const validId = (id) => typeof id === "string" && mongoose.isValidObjectId(id) && id.length === 24;

const summary = (c) => ({
  id: String(c._id),
  title: c.title,
  pinned: c.pinned,
  createdAt: new Date(c.createdAt).getTime(),
  updatedAt: new Date(c.updatedAt).getTime(),
});
const full = (c) => ({ ...summary(c), messages: c.messages || [] });

// Every query includes { userId }. A chat id that belongs to someone else simply is not found.
export function createChatStore(userId) {
  return {
    async list() {
      const rows = await Chat.find({ userId }).select("title pinned createdAt updatedAt").sort({ updatedAt: -1 }).lean();
      return rows.map(summary);
    },
    async get(id) {
      if (!validId(id)) return null;
      const c = await Chat.findOne({ _id: id, userId }).lean();
      return c ? full(c) : null;
    },
    async create(firstMessage) {
      const title = firstMessage.slice(0, 40) + (firstMessage.length > 40 ? "..." : "");
      const c = await Chat.create({ userId, title, messages: [] });
      return full(c.toObject());
    },
    async append(id, ...messages) {
      await Chat.updateOne({ _id: id, userId }, { $push: { messages: { $each: messages } } });
    },
    async update(id, { title, pinned }) {
      if (!validId(id)) return null;
      const set = {};
      if (typeof title === "string" && title.trim()) set.title = title.trim().slice(0, 80);
      if (typeof pinned === "boolean") set.pinned = pinned;
      const c = await Chat.findOneAndUpdate({ _id: id, userId }, { $set: set }, { new: true }).lean();
      return c ? summary(c) : null;
    },
    async remove(id) {
      if (validId(id)) await Chat.deleteOne({ _id: id, userId });
    },
  };
}