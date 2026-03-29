export type AppealSourceType = "HIDDEN_CONTENT_BANNER" | "ORDER_DETAIL";

export type AppealStatus = "INTAKE" | "INVESTIGATION" | "RULING";

export type AppealReasonCategory =
  | "MODERATION"
  | "ORDER_ISSUE"
  | "FULFILLMENT"
  | "QUALITY"
  | "OTHER";

export type AppealFile = {
  id: number;
  appealId: number;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageRelativePath: string;
  checksumSha256: string;
  integrityStatus?: "VERIFIED" | "MISSING" | "CHECKSUM_MISMATCH";
  uploadedByUserId: number;
  createdAt: string;
};

export type AppealDetail = {
  id: number;
  submittedByUserId: number;
  sourceType: AppealSourceType;
  sourceCommentId: number | null;
  sourceOrderId: number | null;
  reasonCategory: AppealReasonCategory;
  narrative: string;
  referencesText: string | null;
  status: AppealStatus;
  currentEventAt: string;
  createdAt: string;
  updatedAt: string;
  files: AppealFile[];
};

export type AppealTimelineEvent = {
  id: number;
  appealId: number;
  fromStatus: AppealStatus | null;
  toStatus: AppealStatus;
  note: string;
  changedByUserId: number | null;
  createdAt: string;
};

export type AppealTimelineResponse = {
  appealId: number;
  status: AppealStatus;
  data: AppealTimelineEvent[];
};

export type AppealListItem = {
  id: number;
  submittedByUserId: number;
  sourceType: AppealSourceType;
  sourceCommentId: number | null;
  sourceOrderId: number | null;
  reasonCategory: AppealReasonCategory;
  narrative: string;
  referencesText: string | null;
  status: AppealStatus;
  currentEventAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AppealListResponse = {
  page: number;
  pageSize: number;
  total: number;
  data: AppealListItem[];
};
