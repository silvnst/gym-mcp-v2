import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes/index.js";
import { setupMcpRoutes } from "./mcp/server.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: process.env["FRONTEND_ORIGIN"] ?? "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// MCP_SECRET guard: if set, the request must supply it as ?token=.
// If unset, the guard is skipped (local dev only).
app.use("/mcp", (req, res, next) => {
  const secret = process.env["MCP_SECRET"];
  const token = req.query["token"] as string | undefined;
  if (secret && token !== secret) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
});

setupMcpRoutes(app);

// Locate the built frontend regardless of the working directory the server was
// started from. FRONTEND_DIST overrides; otherwise check relative to the bundle
// (dist/ -> ../../gym-tracker/dist/public) and relative to the repo root.
const frontendDistCandidates = [
  process.env["FRONTEND_DIST"],
  path.resolve(__dirname, "../../gym-tracker/dist/public"),
  path.join(process.cwd(), "artifacts/gym-tracker/dist/public"),
].filter((p): p is string => !!p);
const frontendDist = frontendDistCandidates.find((p) => fs.existsSync(p));

if (frontendDist) {
  // Production: serve the built React app as static files
  app.use(express.static(frontendDist));
  // Express 5 requires "/{*path}" — plain "*" doesn't match multi-segment paths
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else if (process.env["NODE_ENV"] !== "production") {
  // Development: proxy all remaining requests to the gym-tracker Vite dev server
  const devTarget = process.env["GYM_TRACKER_DEV_URL"] ?? "http://localhost:5173";
  import("http-proxy-middleware").then(({ createProxyMiddleware }) => {
    app.use(
      "/",
      createProxyMiddleware({
        target: devTarget,
        changeOrigin: true,
        ws: true,
        logger: console,
      }),
    );
    logger.info({ target: devTarget }, "Dev proxy active: forwarding / to gym-tracker Vite server");
  });
} else {
  logger.warn(
    { candidates: frontendDistCandidates },
    "No built frontend found — only /api and /mcp are served. Build @workspace/gym-tracker first.",
  );
}

export default app;
