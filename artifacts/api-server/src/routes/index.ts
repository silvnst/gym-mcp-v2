import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";
import plansRouter from "./plans.js";
import sessionsRouter from "./sessions.js";
import setsRouter from "./sets.js";
import progressRouter from "./progress.js";
import insightsRouter from "./insights.js";
import garminRouter from "./garmin.js";
import trashRouter from "./trash.js";
import { userContext } from "../middlewares/user-context.js";

const router: IRouter = Router();

// Health checks stay public so Railway can probe them
router.use(healthRouter);

// Everything below needs a valid Auth0 bearer token and is scoped to that user
router.use(userContext);
router.use(usersRouter);
router.use(plansRouter);
router.use(sessionsRouter);
router.use(setsRouter);
router.use(progressRouter);
router.use(insightsRouter);
router.use(garminRouter);
router.use(trashRouter);

export default router;
