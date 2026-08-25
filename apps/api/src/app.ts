import express from "express";
import { errorHandler } from "./core/errors/error-handler.js";
import { healthHandler } from "./modules/system/routes/health.js";
import { apiV1Router } from "./routes/api-v1.js";
import { docsRouter } from "./routes/docs.js";

const app = express();

app.get("/health/db", healthHandler);
app.use(express.json());
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});
app.use("/docs", docsRouter);
app.use("/api/v1", apiV1Router);
app.use(errorHandler);

export default app;
