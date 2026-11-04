import { Router } from "express";
import { getUserData } from "../services/userData.js";

const router = Router();

// { nodes: [{id,label,type,size}], links: [{source,target,type,weight}] }  (works with react-force-graph)
router.get("/graph", async (req, res, next) => {
  try {
    res.json((await getUserData(req.user.id)).graph.toGraph());
  } catch (err) {
    next(err);
  }
});

export default router;