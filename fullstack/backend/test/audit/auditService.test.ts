import { verifyAuditChain } from "../../src/features/audit/services/auditService";
import * as repo from "../../src/features/audit/repositories/auditRepository";

vi.mock("../../src/features/audit/repositories/auditRepository");

const mockedRepo = vi.mocked(repo);

describe("audit service verifyAuditChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid when the chain is intact", async () => {
    const hashBasis1 = JSON.stringify({ i: 1 });
    const hashBasis2 = JSON.stringify({ i: 2 });

    const crypto = await import("crypto");
    const h1 = crypto
      .createHash("sha256")
      .update(`|${hashBasis1}`)
      .digest("hex");
    const h2 = crypto
      .createHash("sha256")
      .update(`${h1}|${hashBasis2}`)
      .digest("hex");

    mockedRepo.listAuditLogsByIdAsc.mockResolvedValue([
      {
        id: 1,
        actorUserId: 1,
        action: "UPLOAD",
        resourceType: "FILE",
        resourceId: "1",
        metadata: null,
        hashBasis: hashBasis1,
        previousHash: null,
        currentHash: h1,
        createdAt: new Date().toISOString(),
      },
      {
        id: 2,
        actorUserId: 1,
        action: "DOWNLOAD",
        resourceType: "FILE",
        resourceId: "1",
        metadata: null,
        hashBasis: hashBasis2,
        previousHash: h1,
        currentHash: h2,
        createdAt: new Date().toISOString(),
      },
    ]);

    const result = await verifyAuditChain();

    expect(result).toEqual({ total: 2, valid: true, failures: [] });
  });

  it("reports previous-hash and current-hash failures for tampered rows", async () => {
    const hashBasis1 = JSON.stringify({ i: 1 });
    const hashBasis2 = JSON.stringify({ i: 2 });

    const crypto = await import("crypto");
    const h1 = crypto
      .createHash("sha256")
      .update(`|${hashBasis1}`)
      .digest("hex");

    mockedRepo.listAuditLogsByIdAsc.mockResolvedValue([
      {
        id: 1,
        actorUserId: 1,
        action: "UPLOAD",
        resourceType: "FILE",
        resourceId: "1",
        metadata: null,
        hashBasis: hashBasis1,
        previousHash: null,
        currentHash: h1,
        createdAt: new Date().toISOString(),
      },
      {
        id: 2,
        actorUserId: 1,
        action: "DOWNLOAD",
        resourceType: "FILE",
        resourceId: "1",
        metadata: null,
        hashBasis: hashBasis2,
        previousHash: "tampered-previous",
        currentHash: "tampered-current",
        createdAt: new Date().toISOString(),
      },
    ]);

    const result = await verifyAuditChain();

    expect(result.total).toBe(2);
    expect(result.valid).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        { id: 2, reason: "PREVIOUS_HASH_MISMATCH" },
        { id: 2, reason: "CURRENT_HASH_INVALID" },
      ]),
    );
  });
});
