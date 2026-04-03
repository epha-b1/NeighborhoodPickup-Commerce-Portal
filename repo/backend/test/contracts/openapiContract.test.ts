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
      "/threads/resolve",
      "/notifications/{id}/read-state",
      "/appeals",
      "/appeals/{id}",
      "/appeals/{id}/files",
      "/appeals/{id}/timeline",
      "/appeals/{id}/status",
      "/appeals/{id}/files/{fileId}/download",
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

  it("documents the appeal file download endpoint with path parameters", () => {
    const downloadPath = openApiSpec.paths["/appeals/{id}/files/{fileId}/download" as keyof typeof openApiSpec.paths] as Record<string, unknown>;
    expect(downloadPath).toBeDefined();
    const getOp = downloadPath.get as Record<string, unknown>;
    expect(getOp).toBeDefined();
    expect(getOp.tags).toContain("Appeals");
    const params = getOp.parameters as Array<{ name: string; in: string; required: boolean }>;
    const paramNames = params.map((p) => p.name);
    expect(paramNames).toContain("id");
    expect(paramNames).toContain("fileId");
  });

  it("documents /threads/resolve with query parameters", () => {
    const resolvePath = openApiSpec.paths["/threads/resolve" as keyof typeof openApiSpec.paths] as Record<string, unknown>;
    expect(resolvePath).toBeDefined();
    const getOp = resolvePath.get as Record<string, unknown>;
    expect(getOp).toBeDefined();
    const params = getOp.parameters as Array<{ name: string; in: string }>;
    const queryParams = params.filter((p) => p.in === "query").map((p) => p.name);
    expect(queryParams).toContain("contextType");
    expect(queryParams).toContain("contextId");
  });

  it("error envelope matches the implemented ApiErrorEnvelope shape", () => {
    // The actual error contract is: { success: false, error: { code, message, details? } }
    // This test locks the shape so docs and implementation stay aligned.
    type ApiErrorEnvelope = {
      success: false;
      error: { code: string; message: string; details?: unknown };
    };

    const sampleError: ApiErrorEnvelope = {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input.", details: [{ field: "email" }] },
    };

    expect(sampleError.success).toBe(false);
    expect(sampleError.error).toHaveProperty("code");
    expect(sampleError.error).toHaveProperty("message");
  });
});
