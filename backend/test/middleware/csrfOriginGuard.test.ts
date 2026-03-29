import express from "express";
import request from "supertest";

import { csrfOriginGuard } from "../../src/middleware/csrfOriginGuard";

describe("csrf origin guard", () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use(csrfOriginGuard);

    app.post("/unsafe", (_request, response) => {
      response.status(200).json({ ok: true });
    });

    app.get("/safe", (_request, response) => {
      response.status(200).json({ ok: true });
    });

    return app;
  };

  it("allows safe methods without origin headers", async () => {
    const app = buildApp();
    const response = await request(app).get("/safe");

    expect(response.status).toBe(200);
  });

  it("rejects mismatched origin for unsafe methods", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/unsafe")
      .set("origin", "http://malicious.local")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CSRF_ORIGIN_MISMATCH");
  });

  it("allows matching origin for unsafe methods", async () => {
    const app = buildApp();
    const response = await request(app)
      .post("/unsafe")
      .set("origin", "http://localhost:5173")
      .send({});

    expect(response.status).toBe(200);
  });
});
