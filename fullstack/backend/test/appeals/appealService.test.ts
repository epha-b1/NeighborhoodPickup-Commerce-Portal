import {
  createAppealRecord,
  getAppealDetail,
  transitionAppealStatus,
  uploadAppealFiles,
} from "../../src/features/appeals/services/appealService";
import * as repo from "../../src/features/appeals/repositories/appealRepository";
import * as auditService from "../../src/features/audit/services/auditService";

vi.mock("../../src/features/appeals/repositories/appealRepository");
vi.mock("../../src/features/audit/services/auditService", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockedRepo = vi.mocked(repo);
const mockedAuditService = vi.mocked(auditService);

describe("appeal service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuditService.recordAuditLog.mockResolvedValue(undefined);
  });

  it("rejects upload when total files would exceed 5", async () => {
    mockedRepo.findAppealById.mockResolvedValue({
      id: 10,
      submittedByUserId: 1,
      sourceType: "ORDER_DETAIL",
      sourceCommentId: null,
      sourceOrderId: 9,
      reasonCategory: "ORDER_ISSUE",
      narrative: "Need support",
      referencesText: null,
      status: "INTAKE",
      currentEventAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockedRepo.countAppealFiles.mockResolvedValue(4);

    await expect(
      uploadAppealFiles({
        appealId: 10,
        userId: 1,
        roles: ["MEMBER"],
        files: [
          {
            fileName: "a.pdf",
            mimeType: "application/pdf",
            base64Content: Buffer.from("a").toString("base64"),
          },
          {
            fileName: "b.pdf",
            mimeType: "application/pdf",
            base64Content: Buffer.from("b").toString("base64"),
          },
        ],
      }),
    ).rejects.toThrow("TOO_MANY_FILES");
  });

  it("enforces source validation for hidden content appeal", async () => {
    await expect(
      createAppealRecord({
        userId: 4,
        roles: ["MEMBER"],
        input: {
          sourceType: "HIDDEN_CONTENT_BANNER",
          reasonCategory: "MODERATION",
          narrative: "This content was hidden in error with no explanation.",
        },
      }),
    ).rejects.toThrow("MISSING_SOURCE_COMMENT");
  });

  it("rejects order appeal creation for a member who does not own the order", async () => {
    mockedRepo.existsOrder.mockResolvedValue(true);
    mockedRepo.isOrderOwnedByUser.mockResolvedValue(false);

    await expect(
      createAppealRecord({
        userId: 22,
        roles: ["MEMBER"],
        input: {
          sourceType: "ORDER_DETAIL",
          sourceOrderId: 900,
          reasonCategory: "ORDER_ISSUE",
          narrative: "I should not be able to appeal another member's order.",
        },
      }),
    ).rejects.toThrow("APPEAL_FORBIDDEN");

    expect(mockedRepo.createAppeal).not.toHaveBeenCalled();
  });

  it("allows intake -> investigation -> ruling transitions only", async () => {
    mockedRepo.findAppealById.mockResolvedValueOnce({
      id: 18,
      submittedByUserId: 1,
      sourceType: "ORDER_DETAIL",
      sourceCommentId: null,
      sourceOrderId: 4,
      reasonCategory: "ORDER_ISSUE",
      narrative: "Need status update",
      referencesText: null,
      status: "INTAKE",
      currentEventAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await transitionAppealStatus({
      appealId: 18,
      fromUserId: 99,
      fromUserRoles: ["REVIEWER"],
      toStatus: "INVESTIGATION",
      note: "Initial review accepted.",
    });

    expect(mockedRepo.appendAppealStatusEvent).toHaveBeenCalledWith({
      appealId: 18,
      fromStatus: "INTAKE",
      toStatus: "INVESTIGATION",
      note: "Initial review accepted.",
      changedByUserId: 99,
    });

    mockedRepo.findAppealById.mockResolvedValueOnce({
      id: 18,
      submittedByUserId: 1,
      sourceType: "ORDER_DETAIL",
      sourceCommentId: null,
      sourceOrderId: 4,
      reasonCategory: "ORDER_ISSUE",
      narrative: "Need status update",
      referencesText: null,
      status: "INTAKE",
      currentEventAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await expect(
      transitionAppealStatus({
        appealId: 18,
        fromUserId: 99,
        fromUserRoles: ["REVIEWER"],
        toStatus: "RULING",
        note: "Skipping stage should fail.",
      }),
    ).rejects.toThrow("INVALID_STATUS_TRANSITION");
  });

  it("does not allow finance clerk to access another user's appeal detail", async () => {
    mockedRepo.findAppealById.mockResolvedValue({
      id: 29,
      submittedByUserId: 100,
      sourceType: "ORDER_DETAIL",
      sourceCommentId: null,
      sourceOrderId: 9,
      reasonCategory: "ORDER_ISSUE",
      narrative: "Need support",
      referencesText: null,
      status: "INTAKE",
      currentEventAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await expect(
      getAppealDetail({
        appealId: 29,
        requesterUserId: 22,
        requesterRoles: ["FINANCE_CLERK"],
      }),
    ).rejects.toThrow("APPEAL_FORBIDDEN");
  });
});
