/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  query: {
    source: "hidden-content-banner",
    commentId: "42",
  },
}));

const pushMock = vi.hoisted(() => vi.fn());
const createAppealMock = vi.hoisted(() => vi.fn());
const uploadFilesMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: pushMock }),
  RouterLink: {
    template: "<a><slot /></a>",
  },
}));

vi.mock("../src/api/appealApi", () => ({
  appealApi: {
    createAppeal: createAppealMock,
    uploadFiles: uploadFilesMock,
  },
}));

vi.mock("../src/stores/authStore", () => ({
  useAuthStore: () => ({
    roles: ["MEMBER"],
  }),
}));

import AppealDraftPage from "../src/pages/AppealDraftPage.vue";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("AppealDraftPage states", () => {
  beforeEach(() => {
    pushMock.mockReset();
    createAppealMock.mockReset();
    uploadFilesMock.mockReset();
  });

  it("shows validation error when narrative is too short", async () => {
    const wrapper = mount(AppealDraftPage, {
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });

    await wrapper.find("form").trigger("submit.prevent");
    await flush();

    expect(wrapper.text()).toContain(
      "Narrative must be at least 20 characters.",
    );
    expect(createAppealMock).not.toHaveBeenCalled();
  });

  it("shows API error state when submit fails", async () => {
    createAppealMock.mockRejectedValue(new Error("appeal service failed"));

    const wrapper = mount(AppealDraftPage, {
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });

    const textarea = wrapper.find("textarea");
    await textarea.setValue(
      "This narrative is long enough to pass validation.",
    );

    await wrapper.find("form").trigger("submit.prevent");
    await flush();

    expect(createAppealMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("appeal service failed");
  });
});
