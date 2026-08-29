import { env } from "@sunshine-erp/config";
import { ObjectStorageInfrastructureClient } from "@sunshine-erp/storage";
import { logger } from "../logging/logger.js";

export const storageClient = new ObjectStorageInfrastructureClient(
  {
    enabled: env.STORAGE_ENABLED,
    endpoint: env.STORAGE_ENDPOINT,
    accessKey: env.STORAGE_ACCESS_KEY,
    secretKey: env.STORAGE_SECRET_KEY,
    bucket: env.STORAGE_BUCKET,
    region: env.STORAGE_REGION,
  },
  undefined,
  logger,
);
