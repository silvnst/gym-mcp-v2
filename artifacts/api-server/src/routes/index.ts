import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";
import plansRouter from "./plans.js";
import sessionsRouter from "./sessions.js";
import setsRouter from "./sets.js";
import progressRouter from "./progress.js";
import { userContext } from "../middlewares/user-context.js";

const router: IRouter = Router();

// No user context needed for health checks and user management itself
router.use(healthRouter);
router.use(usersRouter);

// Everything below is scoped to the acting user (X-User-Id header)
router.use(userContext);
router.use(plansRouter);
router.use(sessionsRouter);
router.use(setsRouter);
router.use(progressRouter);

export default router;
