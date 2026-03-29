export type AppealSourceType = "HIDDEN_CONTENT_BANNER" | "ORDER_DETAIL";

export type AppealStatus = "INTAKE" | "INVESTIGATION" | "RULING";

export type AppealReasonCategory =
  | "MODERATION"
  | "ORDER_ISSUE"
  | "FULFILLMENT"
  | "QUALITY"
  | "OTHER";

export type CreateAppealInput = {
  sourceType: AppealSourceType;
  sourceCommentId?: number;
  sourceOrderId?: number;
  reasonCategory: AppealReasonCategory;
  narrative: string;
  referencesText?: string;
};

export type AppealUploadInputFile = {
  fileName: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  base64Content: string;
};

export type AppealRecord = {
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

export type AppealEventRecord = {
  id: number;
  appealId: number;
  fromStatus: AppealStatus | null;
  toStatus: AppealStatus;
  note: string;
  changedByUserId: number | null;
  createdAt: string;
};

export type AppealFileRecord = {
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

export type AppealListQuery = {
  page: number;
  pageSize: number;
  status?: AppealStatus;
};
