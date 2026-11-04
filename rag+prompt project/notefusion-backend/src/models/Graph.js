import mongoose from "mongoose";

// One knowledge graph per user, stored as a single document (nodes and edges arrays).
const graphSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    nodes: { type: [mongoose.Schema.Types.Mixed], default: [] },
    edges: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

export const Graph = mongoose.model("Graph", graphSchema);