import app from "./app";
import { logger } from "./lib/logger";
import { ensureUsersBootstrap } from "./middlewares/user-context";
import { startGarminSync } from "./lib/garmin";
import { assertAuthConfigured } from "./lib/auth";
import { startTrashPurge } from "./lib/trash";

// Railway (and most PaaS hosts) inject PORT; fall back to 8080 for local dev.
const port = Number(process.env["PORT"] ?? 8080);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

assertAuthConfigured();

async function main() {
  await ensureUsersBootstrap();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startGarminSync();
    startTrashPurge();
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
