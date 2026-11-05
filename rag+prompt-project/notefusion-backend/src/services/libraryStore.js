import { Doc } from "../models/Doc.js";

// Files are served through /api/files/:docId, which checks ownership in the database.
const toClient = (d) => ({
  id: d.docId,
  filename: d.filename,
  kind: d.kind,
  lectureDate: d.lectureDate || null,
  uploadedAt: new Date(d.createdAt).getTime(),
  chunkCount: d.chunkCount,
  conceptCount: d.conceptCount,
  fileUrl: `/api/files/${d.docId}`,
});

export function createLibrary(userId) {
  return {
    async list() {
      return (await Doc.find({ userId }).sort({ createdAt: -1 }).lean()).map(toClient);
    },
    async getMany(docIds) {
      if (!docIds.length) return [];
      return (await Doc.find({ userId, docId: { $in: docIds } }).lean()).map(toClient);
    },
    // raw record (includes storedName) for serving and deleting the file on disk
    getRaw: (docId) => Doc.findOne({ userId, docId }).lean(),
    async add(doc) {
      const created = await Doc.create({
        userId,
        docId: doc.id,
        filename: doc.filename,
        kind: doc.kind,
        lectureDate: doc.lectureDate,
        storedName: doc.storedName,
        chunkCount: doc.chunkCount,
        conceptCount: doc.conceptCount,
      });
      return toClient(created.toObject());
    },
    remove: (docId) => Doc.deleteOne({ userId, docId }),
  };
}