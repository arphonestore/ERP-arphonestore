import { randomUUID } from "node:crypto";

type LogLevel = "info" | "warn" | "error";
type SafeLogValue = string | number | boolean | null | undefined;
type SafeLogFields = Record<string, SafeLogValue>;

const blockedFieldName = /authorization|body|cookie|credential|password|secret|token/i;
const validCorrelationId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function cleanText(value: string, maxLength = 160) {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLength);
}

function sanitizeFields(fields: SafeLogFields) {
  const safeFields: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || blockedFieldName.test(key)) continue;

    const safeKey = cleanText(key, 64);
    if (!safeKey) continue;

    safeFields[safeKey] = typeof value === "string" ? cleanText(value) : value;
  }

  return safeFields;
}

export function getCorrelationId(request?: Request) {
  const suppliedId = request?.headers.get("x-correlation-id") ?? request?.headers.get("x-request-id");
  return suppliedId && validCorrelationId.test(suppliedId) ? suppliedId : randomUUID();
}

export function createRequestLogger(scope: string, request?: Request) {
  const correlationId = getCorrelationId(request);
  const safeScope = cleanText(scope, 80);

  function write(level: LogLevel, event: string, fields: SafeLogFields = {}) {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      scope: safeScope,
      event: cleanText(event, 100),
      correlationId,
      ...sanitizeFields(fields),
    });

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.info(line);
    }
  }

  return {
    correlationId,
    info: (event: string, fields?: SafeLogFields) => write("info", event, fields),
    warn: (event: string, fields?: SafeLogFields) => write("warn", event, fields),
    error: (event: string, fields?: SafeLogFields) => write("error", event, fields),
  };
}
