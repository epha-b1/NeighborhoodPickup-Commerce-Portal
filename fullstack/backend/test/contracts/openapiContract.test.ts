import request from "supertest";

import { createApp } from "../../src/app";
import { openApiSpec } from "../../src/docs/openapi";

describe("OpenAPI contract", () => {
  it("exposes OpenAPI JSON and Swagger UI endpoints", async () => {
    const app = createApp();

    const openApiResponse = await request(app).get("/openapi.json");
    expect(openApiResponse.status).toBe(200);
    expect(openApiResponse.body.openapi).toBe("3.0.3");

    const docsResponse = await request(app).get("/docs");
    expect(docsResponse.status).toBe(301);
    expect(String(docsResponse.headers.location)).toContain("/docs/");
  });

  it("uses the correct cookie auth contract", () => {
    expect(openApiSpec.components.securitySchemes.cookieAuth).toEqual({
      type: "apiKey",
      in: "cookie",
      name: "neighborhoodpickup_session",
    });
  });

  it("documents implemented high-risk and core endpoints", () => {
    const requiredPaths = [
      "/auth/login",
      "/auth/logout",
      "/auth/me",
      "/orders/quote",
      "/orders/checkout",
      "/orders/{id}",
      "/threads/{id}/comments",
      "/notifications/{id}/read-state",
      "/appeals",
      "/appeals/{id}",
      "/appeals/{id}/files",
      "/appeals/{id}/timeline",
      "/appeals/{id}/status",
      "/finance/reconciliation/export",
      "/audit/logs",
      "/audit/logs/export",
      "/audit/logs/verify-chain",
      "/behavior/events",
      "/admin/jobs/retention-run",
    ];

    for (const pathName of requiredPaths) {
      expect(
        openApiSpec.paths[pathName as keyof typeof openApiSpec.paths],
      ).toBeDefined();
    }
  });
});
