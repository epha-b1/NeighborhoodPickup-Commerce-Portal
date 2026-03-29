import express from "express";
import request from "supertest";

const { loginMock, getCurrentSessionMock, logoutMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  getCurrentSessionMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock("../../src/auth/authService", () => ({
  AuthService: vi.fn().mockImplementation(() => ({
    login: loginMock,
    getCurrentSession: getCurrentSessionMock,
    logout: logoutMock,
  })),
}));

vi.mock("../../src/auth/mysqlAuthStore", () => ({
  MySqlAuthStore: vi.fn(),
}));

import { authRouter } from "../../src/routes/authRoutes";
import { sessionCookieName } from "../../src/middleware/sessionAuth";

describe("auth routes", () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/auth", authRouter);
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets the session cookie on successful login", async () => {
    loginMock.mockResolvedValue({
      ok: true,
      token: "session-token-123",
      expiresAt: new Date("2026-01-15T10:00:00.000Z"),
      user: {
        id: 5,
        username: "admin1",
        roles: ["ADMINISTRATOR"],
      },
    });

    const app = buildApp();
    const response = await request(app)
      .post("/auth/login")
      .send({ username: "admin1", password: "Admin#Pass12345" });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({
      id: 5,
      username: "admin1",
      roles: ["ADMINISTRATOR"],
    });

    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${sessionCookieName}=session-token-123`),
      ]),
    );
    expect(setCookie).toEqual(
      expect.arrayContaining([expect.stringContaining("HttpOnly")]),
    );
  });

  it("returns 423 with lockout details when the account is locked", async () => {
    const lockedUntil = new Date("2026-01-15T10:15:00.000Z");
    loginMock.mockResolvedValue({
      ok: false,
      code: "LOCKED",
      message:
        "Account is temporarily locked due to repeated failed login attempts.",
      lockedUntil,
    });

    const app = buildApp();
    const response = await request(app)
      .post("/auth/login")
      .send({ username: "member1", password: "wrong" });

    expect(response.status).toBe(423);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "LOCKED",
        message:
          "Account is temporarily locked due to repeated failed login attempts.",
        details: {
          lockedUntil: lockedUntil.toISOString(),
        },
      },
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("returns the active session user from the session cookie", async () => {
    getCurrentSessionMock.mockResolvedValue({
      userId: 8,
      username: "leader1",
      roles: ["GROUP_LEADER"],
      expiresAt: new Date("2026-01-16T08:00:00.000Z"),
    });

    const app = buildApp();
    const response = await request(app)
      .get("/auth/me")
      .set("Cookie", `${sessionCookieName}=session-token-abc`);

    expect(response.status).toBe(200);
    expect(getCurrentSessionMock).toHaveBeenCalledWith("session-token-abc");
    expect(response.body.data.user).toEqual({
      id: 8,
      username: "leader1",
      roles: ["GROUP_LEADER"],
    });
  });

  it("clears the cookie and returns 401 when the session is missing", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    const app = buildApp();
    const response = await request(app)
      .get("/auth/me")
      .set("Cookie", `${sessionCookieName}=expired-token`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("NOT_AUTHENTICATED");
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${sessionCookieName}=;`),
      ]),
    );
  });

  it("revokes the session and clears the cookie on logout", async () => {
    logoutMock.mockResolvedValue(undefined);

    const app = buildApp();
    const response = await request(app)
      .post("/auth/logout")
      .set("Cookie", `${sessionCookieName}=session-token-xyz`);

    expect(response.status).toBe(204);
    expect(logoutMock).toHaveBeenCalledWith("session-token-xyz");
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${sessionCookieName}=;`),
      ]),
    );
  });
});
