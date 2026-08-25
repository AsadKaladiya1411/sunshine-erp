import { env } from "@sunshine-erp/config";
import helmet from "helmet";

export const securityHeadersMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      upgradeInsecureRequests: env.NODE_ENV === "development" ? null : [],
    },
  },
});
