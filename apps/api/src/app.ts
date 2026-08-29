import { env } from "@sunshine-erp/config";
import express from "express";
import { errorHandler } from "./core/errors/error-handler.js";
import { apiRateLimitMiddleware } from "./core/middleware/api-rate-limit.middleware.js";
import { correlationIdMiddleware } from "./core/middleware/correlation-id.middleware.js";
import { corsMiddleware } from "./core/middleware/cors.middleware.js";
import { securityHeadersMiddleware } from "./core/middleware/security-headers.middleware.js";
import {
  healthHandler,
  redisHealthHandler,
  storageHealthHandler,
} from "./modules/system/routes/health.js";
import { apiV1Router } from "./routes/api-v1.js";
import { docsRouter } from "./routes/docs.js";

const app = express();

app.disable("x-powered-by");
app.use(correlationIdMiddleware);
app.use(securityHeadersMiddleware);
app.use(corsMiddleware);
app.use(
  express.json({
    limit: env.REQUEST_BODY_LIMIT_BYTES,
  }),
);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});
app.get("/health/db", healthHandler);
app.get("/health/redis", redisHealthHandler);
app.get("/health/storage", storageHealthHandler);
app.use("/docs", docsRouter);
app.use("/api/v1", apiRateLimitMiddleware, apiV1Router);
app.use(errorHandler);

export default app;
