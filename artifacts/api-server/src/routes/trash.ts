import { Router, type IRouter } from "express";
import { z } from "zod";
import { listTrash, restoreFromTrash } from "../lib/trash.js";

const router: IRouter = Router();

router.get("/trash", async (req, res) => {
  try {
    res.json(await listTrash(req.userId));
  } catch {
    res.status(500).json({ error: "Failed to list deleted items" });
  }
});

router.post("/trash/:id/restore", async (req, res) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    const restored = id.success ? await restoreFromTrash(req.userId, id.data) : null;
    if (!restored) {
      res.status(404).json({ error: "Nothing to restore" });
      return;
    }
    res.json(restored);
  } catch {
    res.status(500).json({ error: "Failed to restore" });
  }
});

export default router;
