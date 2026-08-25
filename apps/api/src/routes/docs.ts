import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "../core/openapi/openapi.js";

export const docsRouter = Router();

docsRouter.get("/openapi.json", (_request, response) => {
  response.type("application/json").json(openApiDocument);
});

docsRouter.use(
  "/",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "NO CHEAT ERP API Documentation",
    explorer: false,
    swaggerOptions: {
      displayRequestDuration: true,
      persistAuthorization: false,
      validatorUrl: null,
    },
  }),
);
