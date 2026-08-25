import { env } from "@sunshine-erp/config";
import cors, { type CorsOptions } from "cors";
import { CorsOriginError } from "../http/errors.js";

const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin)) {
      callback(null, origin);
      return;
    }

    callback(new CorsOriginError());
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Correlation-ID"],
  exposedHeaders: ["X-Correlation-ID", "RateLimit", "Retry-After"],
  maxAge: 600,
  optionsSuccessStatus: 204,
};

export const corsMiddleware = cors(corsOptions);
