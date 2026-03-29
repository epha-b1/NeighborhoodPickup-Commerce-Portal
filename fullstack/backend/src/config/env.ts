import dotenv from "dotenv";

dotenv.config();

const isStrictEnv = (process.env.NODE_ENV ?? "development") === "production";

const parseBooleanEnv = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const getEnv = (key: string, fallback: string): string => {
  const value = process.env[key];
  if (value && value.trim().length > 0) {
    return value;
  }

  if (isStrictEnv) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return fallback;
};

const parseOriginList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const configuredFrontendOrigins = parseOriginList(process.env.FRONTEND_ORIGINS);
const legacyFrontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
const frontendOrigins =
  configuredFrontendOrigins.length > 0
    ? configuredFrontendOrigins
    : legacyFrontendOrigin
      ? [legacyFrontendOrigin]
      : ["http://localhost:5173", "http://localhost:8081"];

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  isProduction: isStrictEnv,
  frontendOrigin: frontendOrigins[0],
  frontendOrigins,
  db: {
    host: getEnv("DB_HOST", "127.0.0.1"),
    port: Number(getEnv("DB_PORT", "3306")),
    user: getEnv("DB_USER", "root"),
    password: getEnv("DB_PASSWORD", "root"),
    database: getEnv("DB_NAME", "neighborhoodpickup"),
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
  },
  sessionSecret: getEnv("SESSION_SECRET", "local-dev-session-secret"),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  lockoutMaxAttempts: Number(process.env.LOCKOUT_MAX_ATTEMPTS ?? 5),
  lockoutMinutes: Number(process.env.LOCKOUT_MINUTES ?? 15),
  logUnhandledErrorIncludeStack: parseBooleanEnv(
    process.env.LOG_UNHANDLED_ERROR_INCLUDE_STACK,
    !isStrictEnv,
  ),
  behaviorRetentionRunIntervalMinutes: Number(
    process.env.BEHAVIOR_RETENTION_RUN_INTERVAL_MINUTES ?? 0,
  ),
  dataEncryptionKey: getEnv(
    "DATA_ENCRYPTION_KEY",
    "local-dev-data-encryption-key-change-me",
  ),
};
