import type { Express, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi";

export const registerApiDocs = (app: Express): void => {
  app.get("/openapi.json", (_request: Request, response: Response) => {
    response.json(openApiSpec);
  });

  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      explorer: true,
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );
};
