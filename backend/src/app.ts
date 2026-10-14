import cors from "cors";
import express from "express";
import helmet from "helmet";
import { environment } from "./config/environment.js";
import { notFound } from "./middleware/not-found.middleware.js";
import { healthRouter } from "./routes/health.routes.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: environment.corsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(healthRouter);
app.use(notFound);

