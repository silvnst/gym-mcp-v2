import app from "./app";
import { logger } from "./lib/logger";

// Railway (and most PaaS hosts) inject PORT; fall back to 8080 for local dev.
const port = Number(process.env["PORT"] ?? 8080);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

if (process.env["NODE_ENV"] === "production" && !process.env["MCP_SECRET"]) {
  logger.warn(
    "MCP_SECRET is not set — the /mcp endpoint is unprotected. Set the MCP_SECRET environment variable in production.",
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
