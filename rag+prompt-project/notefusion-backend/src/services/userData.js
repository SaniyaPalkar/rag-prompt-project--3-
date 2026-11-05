import { createVectorStore } from "./vectorStore.js";
import { createLibrary } from "./libraryStore.js";
import { createChatStore } from "./chatStore.js";
import { getGraphStore } from "./graphStore.js";

// Everything a request may touch, already bound to the logged-in user's id.
// There is no way to ask these stores for another user's data.
export async function getUserData(userId) {
  return {
    userId,
    vectors: createVectorStore(userId),
    library: createLibrary(userId),
    chats: createChatStore(userId),
    graph: await getGraphStore(userId),
  };
}