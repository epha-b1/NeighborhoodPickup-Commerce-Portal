/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getNotificationsMock = vi.hoisted(() => vi.fn());
const setNotificationReadStateMock = vi.hoisted(() => vi.fn());

vi.mock("../src/api/discussionApi", () => ({
  discussionApi: {
    getNotifications: getNotificationsMock,
    setNotificationReadState: setNotificationReadStateMock,
  },
}));

import NotificationCenterPage from "../src/pages/NotificationCenterPage.vue";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("NotificationCenterPage states", () => {
  beforeEach(() => {
    getNotificationsMock.mockReset();
    setNotificationReadStateMock.mockReset();
  });

  it("shows empty state when no notifications are returned", async () => {
    getNotificationsMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      data: [],
    });

    const wrapper = mount(NotificationCenterPage, {
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });
    await flush();

    expect(wrapper.text()).toContain("No notifications.");
  });

  it("shows error state when notification fetch fails", async () => {
    getNotificationsMock.mockRejectedValue(new Error("backend unavailable"));

    const wrapper = mount(NotificationCenterPage, {
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });
    await flush();

    expect(wrapper.text()).toContain("backend unavailable");
  });

  it("renders loaded notifications and updates read state", async () => {
    getNotificationsMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      data: [
        {
          id: 99,
          notificationType: "MENTION",
          sourceCommentId: 17,
          discussionId: 5,
          message: "you were mentioned",
          readState: "UNREAD",
          createdAt: "2026-03-29T12:00:00.000Z",
          readAt: null,
        },
      ],
    });
    setNotificationReadStateMock.mockResolvedValue({
      notificationId: 99,
      readState: "READ",
    });

    const wrapper = mount(NotificationCenterPage, {
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });

    await flush();
    expect(wrapper.text()).toContain("you were mentioned");

    const toggleButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Mark Read"));

    expect(toggleButton).toBeDefined();
    await toggleButton!.trigger("click");

    expect(setNotificationReadStateMock).toHaveBeenCalledWith(99, "READ");
  });
});
