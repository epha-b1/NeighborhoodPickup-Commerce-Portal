import { dbPool } from "../../../db/pool";
import { decryptAtRest, encryptAtRest } from "../../../security/dataEncryption";
import type {
  AppealEventRecord,
  AppealFileRecord,
  AppealRecord,
  AppealSourceType,
  AppealStatus,
  CreateAppealInput,
} from "../types";

const toIso = (value: Date | string): string => new Date(value).toISOString();

const maybeEncrypt = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return encryptAtRest(value);
};

const maybeDecrypt = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  return decryptAtRest(value);
};

export const createAppeal = async (params: {
  userId: number;
  input: CreateAppealInput;
}): Promise<AppealRecord> => {
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    const [insertResult] = await conn.query<any>(
      `INSERT INTO appeals
        (submitted_by_user_id, source_type, source_comment_id, source_order_id, reason_category, narrative, references_text, status, current_event_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'INTAKE', CURRENT_TIMESTAMP)`,
      [
        params.userId,
        params.input.sourceType,
        params.input.sourceCommentId ?? null,
        params.input.sourceOrderId ?? null,
        params.input.reasonCategory,
        params.input.narrative,
        maybeEncrypt(params.input.referencesText ?? null),
      ],
    );

    const appealId = Number(insertResult.insertId);

    await conn.query(
      `INSERT INTO appeal_events
        (appeal_id, from_status, to_status, note, changed_by_user_id)
       VALUES (?, NULL, 'INTAKE', 'Appeal submitted', ?)`,
      [appealId, params.userId],
    );

    const [rows] = await conn.query<
      {
        id: number;
        submitted_by_user_id: number;
        source_type: AppealSourceType;
        source_comment_id: number | null;
        source_order_id: number | null;
        reason_category: AppealRecord["reasonCategory"];
        narrative: string;
        references_text: string | null;
        status: AppealStatus;
        current_event_at: Date | string;
        created_at: Date | string;
        updated_at: Date | string;
      }[]
    >(
      `SELECT id,
              submitted_by_user_id,
              source_type,
              source_comment_id,
              source_order_id,
              reason_category,
              narrative,
              references_text,
              status,
              current_event_at,
              created_at,
              updated_at
       FROM appeals
       WHERE id = ?
       LIMIT 1`,
      [appealId],
    );

    await conn.commit();

    const row = rows[0];
    return {
      id: row.id,
      submittedByUserId: row.submitted_by_user_id,
      sourceType: row.source_type,
      sourceCommentId: row.source_comment_id,
      sourceOrderId: row.source_order_id,
      reasonCategory: row.reason_category,
      narrative: row.narrative,
      referencesText: maybeDecrypt(row.references_text),
      status: row.status,
      currentEventAt: toIso(row.current_event_at),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

export const findAppealById = async (
  appealId: number,
): Promise<AppealRecord | null> => {
  const [rows] = await dbPool.query<
    {
      id: number;
      submitted_by_user_id: number;
      source_type: AppealSourceType;
      source_comment_id: number | null;
      source_order_id: number | null;
      reason_category: AppealRecord["reasonCategory"];
      narrative: string;
      references_text: string | null;
      status: AppealStatus;
      current_event_at: Date | string;
      created_at: Date | string;
      updated_at: Date | string;
    }[]
  >(
    `SELECT id,
            submitted_by_user_id,
            source_type,
            source_comment_id,
            source_order_id,
            reason_category,
            narrative,
            references_text,
            status,
            current_event_at,
            created_at,
            updated_at
     FROM appeals
     WHERE id = ?
     LIMIT 1`,
    [appealId],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    submittedByUserId: row.submitted_by_user_id,
    sourceType: row.source_type,
    sourceCommentId: row.source_comment_id,
    sourceOrderId: row.source_order_id,
    reasonCategory: row.reason_category,
    narrative: row.narrative,
    referencesText: maybeDecrypt(row.references_text),
    status: row.status,
    currentEventAt: toIso(row.current_event_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
};

export const listAppeals = async (params: {
  requesterUserId: number;
  requesterRoles: string[];
  page: number;
  pageSize: number;
  status?: AppealStatus;
}) => {
  const offset = (params.page - 1) * params.pageSize;
  const privileged = params.requesterRoles.some((role) =>
    ["REVIEWER", "ADMINISTRATOR"].includes(role),
  );

  const whereClauses: string[] = [];
  const queryParams: Array<number | string> = [];

  if (!privileged) {
    whereClauses.push("a.submitted_by_user_id = ?");
    queryParams.push(params.requesterUserId);
  }

  if (params.status) {
    whereClauses.push("a.status = ?");
    queryParams.push(params.status);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const [countRows] = await dbPool.query<{ total: number }[]>(
    `SELECT COUNT(*) AS total
     FROM appeals a
     ${whereSql}`,
    queryParams,
  );

  const [rows] = await dbPool.query<
    Array<{
      id: number;
      submitted_by_user_id: number;
      source_type: AppealSourceType;
      source_comment_id: number | null;
      source_order_id: number | null;
      reason_category: AppealRecord["reasonCategory"];
      narrative: string;
      references_text: string | null;
      status: AppealStatus;
      current_event_at: Date | string;
      created_at: Date | string;
      updated_at: Date | string;
    }>
  >(
    `SELECT a.id,
            a.submitted_by_user_id,
            a.source_type,
            a.source_comment_id,
            a.source_order_id,
            a.reason_category,
            a.narrative,
            a.references_text,
            a.status,
            a.current_event_at,
            a.created_at,
            a.updated_at
     FROM appeals a
     ${whereSql}
     ORDER BY a.current_event_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, params.pageSize, offset],
  );

  return {
    total: Number(countRows[0]?.total ?? 0),
    rows: rows.map((row) => ({
      id: row.id,
      submittedByUserId: row.submitted_by_user_id,
      sourceType: row.source_type,
      sourceCommentId: row.source_comment_id,
      sourceOrderId: row.source_order_id,
      reasonCategory: row.reason_category,
      narrative: row.narrative,
      referencesText: maybeDecrypt(row.references_text),
      status: row.status,
      currentEventAt: toIso(row.current_event_at),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    })),
  };
};

export const listAppealTimeline = async (
  appealId: number,
): Promise<AppealEventRecord[]> => {
  const [rows] = await dbPool.query<
    {
      id: number;
      appeal_id: number;
      from_status: AppealStatus | null;
      to_status: AppealStatus;
      note: string;
      changed_by_user_id: number | null;
      created_at: Date | string;
    }[]
  >(
    `SELECT id, appeal_id, from_status, to_status, note, changed_by_user_id, created_at
     FROM appeal_events
     WHERE appeal_id = ?
     ORDER BY created_at ASC, id ASC`,
    [appealId],
  );

  return rows.map((row) => ({
    id: row.id,
    appealId: row.appeal_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    changedByUserId: row.changed_by_user_id,
    createdAt: toIso(row.created_at),
  }));
};

export const countAppealFiles = async (appealId: number): Promise<number> => {
  const [rows] = await dbPool.query<{ total: number }[]>(
    "SELECT COUNT(*) AS total FROM appeal_files WHERE appeal_id = ?",
    [appealId],
  );
  return Number(rows[0]?.total ?? 0);
};

export const insertAppealFile = async (params: {
  appealId: number;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageRelativePath: string;
  checksumSha256: string;
  uploadedByUserId: number;
}): Promise<AppealFileRecord> => {
  const [insertResult] = await dbPool.query<any>(
    `INSERT INTO appeal_files
      (appeal_id, original_file_name, mime_type, file_size_bytes, storage_relative_path, checksum_sha256, uploaded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.appealId,
      params.originalFileName,
      params.mimeType,
      params.fileSizeBytes,
      params.storageRelativePath,
      params.checksumSha256,
      params.uploadedByUserId,
    ],
  );

  const [rows] = await dbPool.query<
    {
      id: number;
      appeal_id: number;
      original_file_name: string;
      mime_type: string;
      file_size_bytes: number;
      storage_relative_path: string;
      checksum_sha256: string;
      uploaded_by_user_id: number;
      created_at: Date | string;
    }[]
  >(
    `SELECT id,
            appeal_id,
            original_file_name,
            mime_type,
            file_size_bytes,
            storage_relative_path,
            checksum_sha256,
            uploaded_by_user_id,
            created_at
     FROM appeal_files
     WHERE id = ?
     LIMIT 1`,
    [Number(insertResult.insertId)],
  );

  const row = rows[0];
  return {
    id: row.id,
    appealId: row.appeal_id,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    storageRelativePath: row.storage_relative_path,
    checksumSha256: row.checksum_sha256,
    uploadedByUserId: row.uploaded_by_user_id,
    createdAt: toIso(row.created_at),
  };
};

export const listAppealFiles = async (
  appealId: number,
): Promise<AppealFileRecord[]> => {
  const [rows] = await dbPool.query<
    {
      id: number;
      appeal_id: number;
      original_file_name: string;
      mime_type: string;
      file_size_bytes: number;
      storage_relative_path: string;
      checksum_sha256: string;
      uploaded_by_user_id: number;
      created_at: Date | string;
    }[]
  >(
    `SELECT id,
            appeal_id,
            original_file_name,
            mime_type,
            file_size_bytes,
            storage_relative_path,
            checksum_sha256,
            uploaded_by_user_id,
            created_at
     FROM appeal_files
     WHERE appeal_id = ?
     ORDER BY created_at ASC, id ASC`,
    [appealId],
  );

  return rows.map((row) => ({
    id: row.id,
    appealId: row.appeal_id,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    storageRelativePath: row.storage_relative_path,
    checksumSha256: row.checksum_sha256,
    uploadedByUserId: row.uploaded_by_user_id,
    createdAt: toIso(row.created_at),
  }));
};

export const appendAppealStatusEvent = async (params: {
  appealId: number;
  fromStatus: AppealStatus;
  toStatus: AppealStatus;
  note: string;
  changedByUserId: number;
}): Promise<void> => {
  await dbPool.query(
    `INSERT INTO appeal_events
      (appeal_id, from_status, to_status, note, changed_by_user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.appealId,
      params.fromStatus,
      params.toStatus,
      params.note,
      params.changedByUserId,
    ],
  );

  await dbPool.query(
    `UPDATE appeals
     SET status = ?,
         current_event_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [params.toStatus, params.appealId],
  );
};

export const existsComment = async (commentId: number): Promise<boolean> => {
  const [rows] = await dbPool.query<{ id: number }[]>(
    "SELECT id FROM comments WHERE id = ? LIMIT 1",
    [commentId],
  );
  return rows.length > 0;
};

export const getCommentAppealContext = async (
  commentId: number,
): Promise<{
  commentId: number;
  discussionId: number;
  contextType: "LISTING" | "ORDER";
  contextId: number;
} | null> => {
  const [rows] = await dbPool.query<
    {
      comment_id: number;
      discussion_id: number;
      context_type: "LISTING" | "ORDER";
      context_id: number;
    }[]
  >(
    `SELECT c.id AS comment_id,
            c.discussion_id,
            d.context_type,
            d.context_id
     FROM comments c
     JOIN discussions d ON d.id = c.discussion_id
     WHERE c.id = ?
     LIMIT 1`,
    [commentId],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    commentId: row.comment_id,
    discussionId: row.discussion_id,
    contextType: row.context_type,
    contextId: row.context_id,
  };
};

export const existsOrder = async (orderId: number): Promise<boolean> => {
  const [rows] = await dbPool.query<{ id: number }[]>(
    "SELECT id FROM orders WHERE id = ? LIMIT 1",
    [orderId],
  );
  return rows.length > 0;
};

export const isOrderOwnedByUser = async (params: {
  orderId: number;
  userId: number;
}): Promise<boolean> => {
  const [rows] = await dbPool.query<{ id: number }[]>(
    `SELECT id
     FROM orders
     WHERE id = ?
       AND user_id = ?
     LIMIT 1`,
    [params.orderId, params.userId],
  );

  return rows.length > 0;
};
