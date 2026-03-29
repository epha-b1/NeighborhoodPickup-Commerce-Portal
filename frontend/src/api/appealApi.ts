import { apiRequest } from "./client";
import type {
  AppealDetail,
  AppealListResponse,
  AppealReasonCategory,
  AppealSourceType,
  AppealTimelineResponse,
} from "../types/appeals";

export const appealApi = {
  listAppeals: (params?: {
    page?: number;
    pageSize?: number;
    status?: 'INTAKE' | 'INVESTIGATION' | 'RULING';
  }) => {
    const query = new URLSearchParams();
    query.set('page', String(params?.page ?? 1));
    query.set('pageSize', String(params?.pageSize ?? 20));
    if (params?.status) {
      query.set('status', params.status);
    }
    return apiRequest<AppealListResponse>(`/appeals?${query.toString()}`);
  },

  createAppeal: (payload: {
    sourceType: AppealSourceType;
    sourceCommentId?: number;
    sourceOrderId?: number;
    reasonCategory: AppealReasonCategory;
    narrative: string;
    referencesText?: string;
  }) =>
    apiRequest<{ id: number }>("/appeals", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadFiles: (
    appealId: number,
    files: Array<{ fileName: string; mimeType: string; base64Content: string }>,
  ) =>
    apiRequest<{ appealId: number }>(`/appeals/${appealId}/files`, {
      method: "POST",
      body: JSON.stringify({ files }),
    }),
  getAppeal: (appealId: number) =>
    apiRequest<AppealDetail>(`/appeals/${appealId}`),
  getTimeline: (appealId: number) =>
    apiRequest<AppealTimelineResponse>(`/appeals/${appealId}/timeline`),
  transitionStatus: (
    appealId: number,
    toStatus: "INVESTIGATION" | "RULING",
    note: string,
  ) =>
    apiRequest<{ appealId: number; fromStatus: string; toStatus: string }>(
      `/appeals/${appealId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ toStatus, note }),
      },
    ),
};
