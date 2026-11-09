import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes/index.js";
import { setupMcpRoutes } from "./mcp/server.js";
import { logger } from "./lib/logger.js";
import { protectedResourceMetadata } from "./lib/auth.js";

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

// OAuth protected-resource metadata (RFC 9728). MCP clients read this after a
// 401 to learn which Auth0 tenant issues tokens for /mcp.
function sendResourceMetadata(_req: express.Request, res: express.Response) {
  const metadata = protectedResourceMetadata();
  if (!metadata) {
    res.status(404).json({ error: "Authentication is not configured" });
    return;
  }
  res.json(metadata);
}
app.get("/.well-known/oauth-protected-resource", sendResourceMetadata);
app.get("/.well-known/oauth-protected-resource/mcp", sendResourceMetadata);

// Auth is enforced inside the MCP routes (bearer token per request).
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
