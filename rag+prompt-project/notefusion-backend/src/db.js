import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDb() {
  mongoose.set("strictQuery", true);
  mongoose.connection.on("error", (err) => console.error("MongoDB error:", err.message));
  mongoose.connection.on("disconnected", () => console.warn("MongoDB disconnected"));
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
    console.log(`MongoDB connected (${mongoose.connection.name})`);
  } catch (err) {
    console.error("\nCould not connect to MongoDB:", err.message);
    console.error("Start MongoDB locally, or create a free Atlas cluster and set MONGODB_URI in .env.\n");
    process.exit(1);
  }
}