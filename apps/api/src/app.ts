import express from "express";
import { errorHandler } from "./core/errors/error-handler.js";
import { healthHandler } from "./modules/system/routes/health.js";
const app = express();
app.get("/health/db", healthHandler);
app.use(express.json());
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
  });
});
app.use(errorHandler);
export default app;