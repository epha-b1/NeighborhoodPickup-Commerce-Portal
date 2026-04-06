/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  params: { id: "7" },
  query: {},
}));

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: pushMock }),
  RouterLink: { template: "<a><slot /></a>" },
}));

const getAppealMock = vi.hoisted(() => vi.fn());
const getTimelineMock = vi.hoisted(() => vi.fn());
const transitionStatusMock = vi.hoisted(() => vi.fn());

vi.mock("../src/api/appealApi", () => ({
  appealApi: {
    getAppeal: getAppealMock,
    getTimeline: getTimelineMock,
    transitionStatus: transitionStatusMock,
  },
}));

vi.mock("../src/stores/authStore", () => ({
  useAuthStore: () => ({
    roles: ["REVIEWER"],
  }),
}));

import AppealStatusPage from "../src/pages/AppealStatusPage.vue";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const baseAppeal = {
  id: 7,
  submittedByUserId: 1,
  sourceType: "ORDER_DETAIL" as const,
  sourceCommentId: null,
  sourceOrderId: 99,
  reasonCategory: "ORDER_ISSUE" as const,
  narrative: "The items arrived damaged and incomplete.",
  referencesText: "Order #99, item #3",
  status: "INTAKE" as const,
  currentEventAt: "2026-04-01T10:00:00.000Z",
  createdAt: "2026-04-01T09:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
  files: [
    {
      id: 1,
      appealId: 7,
      originalFileName: "evidence.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 2048000,
      checksumSha256: "abc123def456",
      integrityStatus: "VERIFIED" as const,
      uploadedByUserId: 1,
      createdAt: "2026-04-01T09:30:00.000Z",
    },
  ],
};

const baseTimeline = [
  {
    id: 1,
    appealId: 7,
    fromStatus: null,
    toStatus: "INTAKE",
    note: "Appeal submitted",
    changedByUserId: 1,
    createdAt: "2026-04-01T09:00:00.000Z",
  },
];

describe("AppealStatusPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders appeal detail with files and timeline", async () => {
    getAppealMock.mockResolvedValue(baseAppeal);
    getTimelineMock.mockResolvedValue({ appealId: 7, status: "INTAKE", data: baseTimeline });

    const wrapper = mount(AppealStatusPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("Appeal #7");
    expect(wrapper.text()).toContain("INTAKE");
    expect(wrapper.text()).toContain("ORDER_DETAIL");
    expect(wrapper.text()).toContain("The items arrived damaged and incomplete");
    expect(wrapper.text()).toContain("evidence.pdf");
    expect(wrapper.text()).toContain("VERIFIED");
    expect(wrapper.text()).toContain("Appeal submitted");
  });

  it("shows transition button for reviewer on INTAKE status", async () => {
    getAppealMock.mockResolvedValue(baseAppeal);
    getTimelineMock.mockResolvedValue({ appealId: 7, status: "INTAKE", data: baseTimeline });

    const wrapper = mount(AppealStatusPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("Reviewer Action");
    const investigationBtn = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Move to Investigation"));
    expect(investigationBtn).toBeDefined();
  });

  it("validates transition note is required", async () => {
    getAppealMock.mockResolvedValue(baseAppeal);
    getTimelineMock.mockResolvedValue({ appealId: 7, status: "INTAKE", data: baseTimeline });

    const wrapper = mount(AppealStatusPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    const investigationBtn = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Move to Investigation"));
    await investigationBtn!.trigger("click");
    await flush();

    expect(wrapper.text()).toContain("Transition note is required");
    expect(transitionStatusMock).not.toHaveBeenCalled();
  });

  it("transitions appeal from INTAKE to INVESTIGATION", async () => {
    const updatedAppeal = { ...baseAppeal, status: "INVESTIGATION" as const };
    getAppealMock
      .mockResolvedValueOnce(baseAppeal)
      .mockResolvedValueOnce(updatedAppeal);

    const updatedTimeline = [
      ...baseTimeline,
      {
        id: 2,
        appealId: 7,
        fromStatus: "INTAKE",
        toStatus: "INVESTIGATION",
        note: "Beginning investigation",
        changedByUserId: 99,
        createdAt: "2026-04-02T10:00:00.000Z",
      },
    ];
    getTimelineMock
      .mockResolvedValueOnce({ appealId: 7, status: "INTAKE", data: baseTimeline })
      .mockResolvedValueOnce({ appealId: 7, status: "INVESTIGATION", data: updatedTimeline });

    transitionStatusMock.mockResolvedValue({
      appealId: 7,
      fromStatus: "INTAKE",
      toStatus: "INVESTIGATION",
    });

    const wrapper = mount(AppealStatusPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    await wrapper.find('input[placeholder="Add transition reason"]').setValue("Beginning investigation");
    const investigationBtn = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Move to Investigation"));
    await investigationBtn!.trigger("click");
    await flush();

    expect(transitionStatusMock).toHaveBeenCalledWith(7, "INVESTIGATION", "Beginning investigation");
  });

  it("shows Move to Ruling button when appeal is in INVESTIGATION status", async () => {
    const investigationAppeal = { ...baseAppeal, status: "INVESTIGATION" as const };
    const investigationTimeline = [
      ...baseTimeline,
      {
        id: 2,
        appealId: 7,
        fromStatus: "INTAKE",
        toStatus: "INVESTIGATION",
        note: "Started investigation",
        changedByUserId: 99,
        createdAt: "2026-04-02T10:00:00.000Z",
      },
    ];

    getAppealMock.mockResolvedValue(investigationAppeal);
    getTimelineMock.mockResolvedValue({
      appealId: 7,
      status: "INVESTIGATION",
      data: investigationTimeline,
    });

    const wrapper = mount(AppealStatusPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("INVESTIGATION");
    const rulingBtn = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Move to Ruling"));
    expect(rulingBtn).toBeDefined();
  });

  it("transitions appeal from INVESTIGATION to RULING", async () => {
    const investigationAppeal = { ...baseAppeal, status: "INVESTIGATION" as const };
    const rulingAppeal = { ...baseAppeal, status: "RULING" as const };

    getAppealMock
      .mockResolvedValueOnce(investigationAppeal)
      .mockResolvedValueOnce(rulingAppeal);

    getTimelineMock
      .mockResolvedValueOnce({
        appealId: 7,
        status: "INVESTIGATION",
        data: [
          ...baseTimeline,
          { id: 2, appealId: 7, fromStatus: "INTAKE", toStatus: "INVESTIGATION", note: "Started", changedByUserId: 99, createdAt: "2026-04-02T10:00:00.000Z" },
        ],
      })
      .mockResolvedValueOnce({
        appealId: 7,
        status: "RULING",
        data: [
          ...baseTimeline,
          { id: 2, appealId: 7, fromStatus: "INTAKE", toStatus: "INVESTIGATION", note: "Started", changedByUserId: 99, createdAt: "2026-04-02T10:00:00.000Z" },
          { id: 3, appealId: 7, fromStatus: "INVESTIGATION", toStatus: "RULING", note: "Evidence reviewed", changedByUserId: 99, createdAt: "2026-04-03T10:00:00.000Z" },
        ],
      });

    transitionStatusMock.mockResolvedValue({
      appealId: 7,
      fromStatus: "INVESTIGATION",
      toStatus: "RULING",
    });

    const wrapper = mount(AppealStatusPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    await wrapper.find('input[placeholder="Add transition reason"]').setValue("Evidence reviewed");
    const rulingBtn = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Move to Ruling"));
    await rulingBtn!.trigger("click");
    await flush();

    expect(transitionStatusMock).toHaveBeenCalledWith(7, "RULING", "Evidence reviewed");
  });

  it("displays file integrity status in appeal details", async () => {
    const appealWithTamperedFile = {
      ...baseAppeal,
      files: [
        {
          ...baseAppeal.files[0],
          integrityStatus: "TAMPERED" as const,
        },
      ],
    };
    getAppealMock.mockResolvedValue(appealWithTamperedFile);
    getTimelineMock.mockResolvedValue({ appealId: 7, status: "INTAKE", data: baseTimeline });

    const wrapper = mount(AppealStatusPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flush();

    expect(wrapper.text()).toContain("TAMPERED");
  });
});
