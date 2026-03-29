import {
  createThreadComment,
  getThreadComments,
} from "../../src/features/discussions/services/discussionService";
import * as repo from "../../src/features/discussions/repositories/discussionRepository";
import * as auditService from "../../src/features/audit/services/auditService";

vi.mock("../../src/features/discussions/repositories/discussionRepository");
vi.mock("../../src/features/behavior/services/behaviorService", () => ({
  recordServerBehaviorEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/features/audit/services/auditService", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockedRepo = vi.mocked(repo);
const mockedAuditService = vi.mocked(auditService);

describe("discussion service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates mention notifications when @username is present", async () => {
    mockedRepo.isOrderOwnedByUser.mockResolvedValue(true);
    mockedRepo.getOrCreateDiscussion.mockResolvedValue({
      id: 100,
      contextType: "LISTING",
      contextId: 5,
    });
    mockedRepo.createComment.mockResolvedValue({ commentId: 200 });
    mockedRepo.findUsersByUsernames.mockResolvedValue([
      { id: 12, username: "leader1" },
      { id: 13, username: "reviewer1" },
    ]);
    mockedRepo.createCommentMentions.mockResolvedValue();
    mockedRepo.createNotification.mockResolvedValue();

    const result = await createThreadComment({
      input: {
        contextType: "LISTING",
        contextId: 5,
        body: "Please check this @leader1 and @reviewer1",
      },
      userId: 1,
      username: "member1",
      roles: ["MEMBER"],
    });

    expect(result.commentId).toBe(200);
    expect(mockedRepo.createCommentMentions).toHaveBeenCalledWith({
      commentId: 200,
      mentions: [
        { userId: 12, username: "leader1" },
        { userId: 13, username: "reviewer1" },
      ],
    });
    expect(mockedRepo.createNotification).toHaveBeenCalledTimes(2);
    expect(mockedAuditService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SHARE",
        resourceType: "DISCUSSION_COMMENT",
        resourceId: 200,
      }),
    );
  });

  it("returns fixed page size 20 for thread response", async () => {
    mockedRepo.getDiscussionById.mockResolvedValue({
      id: 100,
      contextType: "ORDER",
      contextId: 44,
    });
    mockedRepo.getThreadCommentsPage.mockResolvedValue({
      total: 31,
      comments: [],
    });

    const page = await getThreadComments({
      discussionId: 100,
      page: 2,
      sort: "newest",
      userId: 1,
      roles: ["REVIEWER"],
    });

    expect(page?.pageSize).toBe(20);
    expect(page?.page).toBe(2);
  });

  it("blocks member access to order thread they do not own", async () => {
    mockedRepo.getDiscussionById.mockResolvedValue({
      id: 101,
      contextType: "ORDER",
      contextId: 77,
    });
    mockedRepo.isOrderOwnedByUser.mockResolvedValue(false);

    await expect(
      getThreadComments({
        discussionId: 101,
        page: 1,
        sort: "newest",
        userId: 9,
        roles: ["MEMBER"],
      }),
    ).rejects.toThrow("THREAD_FORBIDDEN");
  });

  it("allows privileged role access to order thread without ownership", async () => {
    mockedRepo.getDiscussionById.mockResolvedValue({
      id: 102,
      contextType: "ORDER",
      contextId: 88,
    });
    mockedRepo.getThreadCommentsPage.mockResolvedValue({
      total: 1,
      comments: [],
    });

    await getThreadComments({
      discussionId: 102,
      page: 1,
      sort: "newest",
      userId: 14,
      roles: ["REVIEWER"],
    });

    expect(mockedRepo.isOrderOwnedByUser).not.toHaveBeenCalled();
    expect(mockedRepo.getThreadCommentsPage).toHaveBeenCalled();
  });
});
