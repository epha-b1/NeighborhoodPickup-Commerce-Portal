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
import { logger } from "../../../utils/logger";
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

const base64PayloadPattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

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
  const normalized = file.base64Content.replace(/\s+/g, "");

  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !base64PayloadPattern.test(normalized)
  ) {
    throw new Error("INVALID_BASE64_FILE");
  }

  const binary = Buffer.from(normalized, "base64");
  const encoded = binary.toString("base64");

  if (encoded !== normalized) {
    throw new Error("INVALID_BASE64_FILE");
  }

  return binary;
};

const hasBinaryPrefix = (binary: Buffer, bytes: number[]): boolean => {
  if (binary.byteLength < bytes.length) {
    return false;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    if (binary[index] !== bytes[index]) {
      return false;
    }
  }

  return true;
};

const assertFileSignatureMatchesMimeType = (params: {
  mimeType: AppealUploadInputFile["mimeType"];
  binary: Buffer;
}): void => {
  const signatureMatches =
    (params.mimeType === "application/pdf" &&
      hasBinaryPrefix(params.binary, [0x25, 0x50, 0x44, 0x46, 0x2d])) ||
    (params.mimeType === "image/jpeg" &&
      hasBinaryPrefix(params.binary, [0xff, 0xd8, 0xff])) ||
    (params.mimeType === "image/png" &&
      hasBinaryPrefix(params.binary, [
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]));

  if (!signatureMatches) {
    throw new Error("FILE_SIGNATURE_MISMATCH");
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
    const commentContext = await getCommentAppealContext(
      params.input.sourceCommentId,
    );
    if (!commentContext) {
      throw new Error("SOURCE_COMMENT_NOT_FOUND");
    }

    if (
      params.input.sourceType === "HIDDEN_CONTENT_BANNER" &&
      !commentContext.isHidden
    ) {
      throw new Error("SOURCE_COMMENT_NOT_HIDDEN");
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

    assertFileSignatureMatchesMimeType({
      mimeType: file.mimeType,
      binary,
    });

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

  await recordAuditLog({
    actorUserId: params.userId,
    action: "UPLOAD",
    resourceType: "APPEAL_FILE",
    resourceId: appeal.id,
    metadata: { fileCount: inserted.length },
  });

  logger.info("appeals.files.uploaded", "Appeal evidence uploaded", {
    appealId: appeal.id,
    uploadedByUserId: params.userId,
    fileCount: inserted.length,
    status: appeal.status,
  });

  return {
    appealId: appeal.id,
    uploaded: inserted.map((file) => ({
      id: file.id,
      appealId: file.appealId,
      originalFileName: file.originalFileName,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
      checksumSha256: file.checksumSha256,
      uploadedByUserId: file.uploadedByUserId,
      createdAt: file.createdAt,
    })),
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
    files.map(async (file) => {
      const integrityStatus = await verifyStoredFileIntegrity({
        storageRelativePath: file.storageRelativePath,
        checksumSha256: file.checksumSha256,
      });

      return {
        id: file.id,
        appealId: file.appealId,
        originalFileName: file.originalFileName,
        mimeType: file.mimeType,
        fileSizeBytes: file.fileSizeBytes,
        checksumSha256: file.checksumSha256,
        integrityStatus,
        uploadedByUserId: file.uploadedByUserId,
        createdAt: file.createdAt,
      };
    }),
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
    logger.warn(
      "appeals.status.transition_forbidden",
      "Rejected appeal status transition attempt",
      {
        appealId: params.appealId,
        actorUserId: params.fromUserId,
      },
    );
    throw new Error("APPEAL_STATUS_FORBIDDEN");
  }

  const appeal = await findAppealById(params.appealId);
  if (!appeal) {
    throw new Error("APPEAL_NOT_FOUND");
  }

  const allowedNext = statusTransitionMap[appeal.status];
  if (!allowedNext.includes(params.toStatus)) {
    logger.warn(
      "appeals.status.transition_invalid",
      "Invalid appeal status transition requested",
      {
        appealId: params.appealId,
        fromStatus: appeal.status,
        toStatus: params.toStatus,
        actorUserId: params.fromUserId,
      },
    );
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

  logger.info("appeals.status.transitioned", "Appeal status transitioned", {
    appealId: appeal.id,
    fromStatus: appeal.status,
    toStatus: params.toStatus,
    actorUserId: params.fromUserId,
  });

  return {
    appealId: appeal.id,
    fromStatus: appeal.status,
    toStatus: params.toStatus,
  };
};

export const getAppealFileForDownload = async (params: {
  appealId: number;
  fileId: number;
  requesterUserId: number;
  requesterRoles: string[];
}): Promise<{
  filePath: string;
  originalFileName: string;
  mimeType: string;
} | null> => {
  const appeal = await findAppealById(params.appealId);
  if (!appeal) {
    return null;
  }

  assertAppealAccess(appeal, {
    userId: params.requesterUserId,
    roles: params.requesterRoles,
  });

  const files = await listAppealFiles(params.appealId);
  const file = files.find((f) => f.id === params.fileId);
  if (!file) {
    return null;
  }

  const absolutePath = path.resolve(process.cwd(), file.storageRelativePath);

  await recordAuditLog({
    actorUserId: params.requesterUserId,
    action: "DOWNLOAD",
    resourceType: "APPEAL_FILE",
    resourceId: file.id,
    metadata: {
      appealId: params.appealId,
      originalFileName: file.originalFileName,
    },
  });

  return {
    filePath: absolutePath,
    originalFileName: file.originalFileName,
    mimeType: file.mimeType,
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
