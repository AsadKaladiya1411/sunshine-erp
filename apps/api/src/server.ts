import app from "./app.js";
import { env } from "@sunshine-erp/config";
import { logger } from "./core/logging/logger.js";
app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT },
    "API server started",
  );
});