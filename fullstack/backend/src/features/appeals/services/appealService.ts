import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  appendAppealStatusEvent,
  countAppealFiles,
  createAppeal,
  existsOrder,
  getCommentAppealContext,
  findAppealById,
  insertAppealFile,
  isOrderOwnedByUser,
  listAppealFiles,
  listAppeals,
  listAppealTimeline,
} from "../repositories/appealRepository";
import { recordAuditLog } from "../../audit/services/auditService";
import type {
  AppealRecord,
  AppealStatus,
  AppealUploadInputFile,
  CreateAppealInput,
} from "../types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_APPEAL = 5;
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const statusTransitionMap: Record<AppealStatus, AppealStatus[]> = {
  INTAKE: ["INVESTIGATION"],
  INVESTIGATION: ["RULING"],
  RULING: [],
};

const sanitizeFileName = (fileName: string): string =>
  fileName
    .replaceAll(/[^a-zA-Z0-9._-]/g, "_")
    .replaceAll(/_+/g, "_")
    .slice(0, 120);

const ensureAppealUploadDir = async (appealId: number): Promise<string> => {
  const directory = path.resolve(
    process.cwd(),
    "storage",
    "appeals",
    String(appealId),
  );
  await fs.mkdir(directory, { recursive: true });
  return directory;
};

const decodeBase64File = (file: AppealUploadInputFile): Buffer => {
  try {
    return Buffer.from(file.base64Content, "base64");
  } catch {
    throw new Error("INVALID_BASE64_FILE");
  }
};

const hasElevatedAppealAccess = (roles: string[]): boolean =>
  roles.some((role) => ["REVIEWER", "ADMINISTRATOR"].includes(role));

const assertAppealAccess = (
  appeal: AppealRecord,
  requester: { userId: number; roles: string[] },
): void => {
  const elevated = hasElevatedAppealAccess(requester.roles);

  if (!elevated && appeal.submittedByUserId !== requester.userId) {
    throw new Error("APPEAL_FORBIDDEN");
  }
};

const assertAppealSourceAccess = async (params: {
  userId: number;
  roles: string[];
  sourceCommentId?: number;
  sourceOrderId?: number;
}) => {
  if (hasElevatedAppealAccess(params.roles)) {
    return;
  }

  if (params.sourceCommentId) {
    const commentContext = await getCommentAppealContext(
      params.sourceCommentId,
    );
    if (!commentContext) {
      throw new Error("SOURCE_COMMENT_NOT_FOUND");
    }

    if (commentContext.contextType === "ORDER") {
      const isOwner = await isOrderOwnedByUser({
        orderId: commentContext.contextId,
        userId: params.userId,
      });

      if (!isOwner) {
        throw new Error("APPEAL_FORBIDDEN");
      }
    }
  }

  if (params.sourceOrderId) {
    const isOwner = await isOrderOwnedByUser({
      orderId: params.sourceOrderId,
      userId: params.userId,
    });

    if (!isOwner) {
      throw new Error("APPEAL_FORBIDDEN");
    }
  }
};

const verifyStoredFileIntegrity = async (params: {
  storageRelativePath: string;
  checksumSha256: string;
}): Promise<"VERIFIED" | "MISSING" | "CHECKSUM_MISMATCH"> => {
  const absolutePath = path.resolve(process.cwd(), params.storageRelativePath);

  try {
    const binary = await fs.readFile(absolutePath);
    const checksum = crypto.createHash("sha256").update(binary).digest("hex");
    return checksum === params.checksumSha256
      ? "VERIFIED"
      : "CHECKSUM_MISMATCH";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "MISSING";
    }

    throw error;
  }
};

export const createAppealRecord = async (params: {
  userId: number;
  roles: string[];
  input: CreateAppealInput;
}) => {
  if (
    params.input.sourceType === "HIDDEN_CONTENT_BANNER" &&
    !params.input.sourceCommentId
  ) {
    throw new Error("MISSING_SOURCE_COMMENT");
  }

  if (
    params.input.sourceType === "ORDER_DETAIL" &&
    !params.input.sourceOrderId
  ) {
    throw new Error("MISSING_SOURCE_ORDER");
  }

  if (params.input.sourceCommentId) {
    const found = await getCommentAppealContext(params.input.sourceCommentId);
    if (!found) {
      throw new Error("SOURCE_COMMENT_NOT_FOUND");
    }
  }

  if (params.input.sourceOrderId) {
    const found = await existsOrder(params.input.sourceOrderId);
    if (!found) {
      throw new Error("SOURCE_ORDER_NOT_FOUND");
    }
  }

  await assertAppealSourceAccess({
    userId: params.userId,
    roles: params.roles,
    sourceCommentId: params.input.sourceCommentId,
    sourceOrderId: params.input.sourceOrderId,
  });

  const created = await createAppeal({
    userId: params.userId,
    input: params.input,
  });

  await recordAuditLog({
    actorUserId: params.userId,
    action: "UPLOAD",
    resourceType: "APPEAL",
    resourceId: created.id,
    metadata: {
      sourceType: created.sourceType,
      reasonCategory: created.reasonCategory,
    },
  });

  return created;
};

export const uploadAppealFiles = async (params: {
  appealId: number;
  userId: number;
  roles: string[];
  files: AppealUploadInputFile[];
}) => {
  const appeal = await findAppealById(params.appealId);
  if (!appeal) {
    throw new Error("APPEAL_NOT_FOUND");
  }

  assertAppealAccess(appeal, {
    userId: params.userId,
    roles: params.roles,
  });

  if (params.files.length === 0) {
    throw new Error("NO_FILES_PROVIDED");
  }

  const existingCount = await countAppealFiles(params.appealId);
  if (existingCount + params.files.length > MAX_FILES_PER_APPEAL) {
    throw new Error("TOO_MANY_FILES");
  }

  const uploadDir = await ensureAppealUploadDir(params.appealId);
  const inserted = [] as Awaited<ReturnType<typeof insertAppealFile>>[];

  for (const file of params.files) {
    if (!allowedMimeTypes.has(file.mimeType)) {
      throw new Error("UNSUPPORTED_FILE_TYPE");
    }

    const binary = decodeBase64File(file);
    if (binary.byteLength > MAX_FILE_BYTES) {
      throw new Error("FILE_TOO_LARGE");
    }

    const checksum = crypto.createHash("sha256").update(binary).digest("hex");
    const safeName = sanitizeFileName(file.fileName || "upload.bin");
    const storageName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const absolutePath = path.join(uploadDir, storageName);

    await fs.writeFile(absolutePath, binary);

    const relativePath = path.join(
      "storage",
      "appeals",
      String(params.appealId),
      storageName,
    );

    const record = await insertAppealFile({
      appealId: params.appealId,
      originalFileName: file.fileName,
      mimeType: file.mimeType,
      fileSizeBytes: binary.byteLength,
      storageRelativePath: relativePath.replaceAll("\\", "/"),
      checksumSha256: checksum,
      uploadedByUserId: params.userId,
    });

    inserted.push(record);
  }

  if (appeal.status === "INTAKE") {
    await appendAppealStatusEvent({
      appealId: appeal.id,
      fromStatus: "INTAKE",
      toStatus: "INVESTIGATION",
      note: "Evidence uploaded and moved to investigation.",
      changedByUserId: params.userId,
    });
  }

  await recordAuditLog({
    actorUserId: params.userId,
    action: "UPLOAD",
    resourceType: "APPEAL_FILE",
    resourceId: appeal.id,
    metadata: { fileCount: inserted.length },
  });

  return {
    appealId: appeal.id,
    uploaded: inserted,
  };
};

export const getAppealDetail = async (params: {
  appealId: number;
  requesterUserId: number;
  requesterRoles: string[];
}) => {
  const appeal = await findAppealById(params.appealId);
  if (!appeal) {
    return null;
  }

  assertAppealAccess(appeal, {
    userId: params.requesterUserId,
    roles: params.requesterRoles,
  });

  const files = await listAppealFiles(appeal.id);
  const filesWithIntegrity = await Promise.all(
    files.map(async (file) => ({
      ...file,
      integrityStatus: await verifyStoredFileIntegrity({
        storageRelativePath: file.storageRelativePath,
        checksumSha256: file.checksumSha256,
      }),
    })),
  );

  return {
    ...appeal,
    files: filesWithIntegrity,
  };
};

export const getAppealTimeline = async (params: {
  appealId: number;
  requesterUserId: number;
  requesterRoles: string[];
}) => {
  const appeal = await findAppealById(params.appealId);
  if (!appeal) {
    return null;
  }

  assertAppealAccess(appeal, {
    userId: params.requesterUserId,
    roles: params.requesterRoles,
  });

  const timeline = await listAppealTimeline(appeal.id);

  return {
    appealId: appeal.id,
    status: appeal.status,
    data: timeline,
  };
};

export const transitionAppealStatus = async (params: {
  appealId: number;
  fromUserId: number;
  fromUserRoles: string[];
  toStatus: AppealStatus;
  note: string;
}) => {
  const canModerate = params.fromUserRoles.some((role) =>
    ["REVIEWER", "ADMINISTRATOR"].includes(role),
  );

  if (!canModerate) {
    throw new Error("APPEAL_STATUS_FORBIDDEN");
  }

  const appeal = await findAppealById(params.appealId);
  if (!appeal) {
    throw new Error("APPEAL_NOT_FOUND");
  }

  const allowedNext = statusTransitionMap[appeal.status];
  if (!allowedNext.includes(params.toStatus)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  await appendAppealStatusEvent({
    appealId: appeal.id,
    fromStatus: appeal.status,
    toStatus: params.toStatus,
    note: params.note,
    changedByUserId: params.fromUserId,
  });

  await recordAuditLog({
    actorUserId: params.fromUserId,
    action: "APPROVAL",
    resourceType: "APPEAL_STATUS",
    resourceId: appeal.id,
    metadata: {
      fromStatus: appeal.status,
      toStatus: params.toStatus,
      note: params.note,
    },
  });

  return {
    appealId: appeal.id,
    fromStatus: appeal.status,
    toStatus: params.toStatus,
  };
};

export const listAppealQueue = async (params: {
  requesterUserId: number;
  requesterRoles: string[];
  page: number;
  pageSize: number;
  status?: AppealStatus;
}) => {
  return listAppeals({
    requesterUserId: params.requesterUserId,
    requesterRoles: params.requesterRoles,
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
  });
};
