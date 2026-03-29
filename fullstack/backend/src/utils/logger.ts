type LogLevel = "info" | "warn" | "error";

const emit = (
  level: LogLevel,
  event: string,
  message: string,
  metadata?: Record<string, unknown>,
): void => {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    message,
    ...(metadata ?? {}),
  };

  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
};

export const logger = {
  info: (event: string, message: string, metadata?: Record<string, unknown>) =>
    emit("info", event, message, metadata),
  warn: (event: string, message: string, metadata?: Record<string, unknown>) =>
    emit("warn", event, message, metadata),
  error: (event: string, message: string, metadata?: Record<string, unknown>) =>
    emit("error", event, message, metadata),
};
