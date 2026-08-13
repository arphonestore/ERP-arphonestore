import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_JSON_BODY_BYTES = 32 * 1024;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

type DatabaseErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

type ValidationFailure = {
  ok: false;
  response: NextResponse;
};

type ValidationSuccess<T> = {
  ok: true;
  data: T;
};

export class ApiResultLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiResultLimitError";
  }
}

function correlationId() {
  return crypto.randomUUID();
}

function validationResponse(error: z.ZodError) {
  const firstIssue = error.issues[0];
  const path = firstIssue?.path.length ? `${firstIssue.path.join(".")}: ` : "";

  return NextResponse.json(
    {
      message: firstIssue ? `${path}${firstIssue.message}` : "Data permintaan tidak valid.",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400, headers: NO_STORE_HEADERS }
  );
}

export function jsonNoStore(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);

  return NextResponse.json(data, { ...init, headers });
}

export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema
): Promise<ValidationFailure | ValidationSuccess<z.infer<TSchema>>> {
  const contentLength = request.headers.get("content-length");
  const declaredBytes = contentLength === null ? null : Number(contentLength);

  if (declaredBytes !== null && (!Number.isFinite(declaredBytes) || declaredBytes > MAX_JSON_BODY_BYTES)) {
    return {
      ok: false,
      response: jsonNoStore(
        { message: `Body JSON maksimal ${MAX_JSON_BODY_BYTES} byte.` },
        { status: 413 }
      ),
    };
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      response: jsonNoStore({ message: "Body permintaan tidak dapat dibaca." }, { status: 400 }),
    };
  }

  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      response: jsonNoStore(
        { message: `Body JSON maksimal ${MAX_JSON_BODY_BYTES} byte.` },
        { status: 413 }
      ),
    };
  }

  let body: unknown;

  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      response: jsonNoStore({ message: "Body JSON tidak valid." }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: validationResponse(parsed.error) };
}

export function parseSearchParams<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema
): ValidationFailure | ValidationSuccess<z.infer<TSchema>> {
  const values: Record<string, string> = {};

  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(values, key)) {
      return {
        ok: false,
        response: jsonNoStore(
          { message: `Parameter query ${key} tidak boleh dikirim lebih dari sekali.` },
          { status: 400 }
        ),
      };
    }

    values[key] = value;
  }

  const parsed = schema.safeParse(values);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: validationResponse(parsed.error) };
}

export function parseRouteId(id: string, schema: z.ZodType<string>) {
  const parsed = schema.safeParse(id);
  return parsed.success
    ? ({ ok: true, data: parsed.data } as const)
    : ({ ok: false, response: validationResponse(parsed.error) } as const);
}

export function methodNotAllowed(allowedMethods: string[]) {
  return jsonNoStore(
    { message: "Method tidak diizinkan untuk endpoint ini." },
    {
      status: 405,
      headers: { Allow: allowedMethods.join(", ") },
    }
  );
}

function databaseErrorDetails(error: unknown): DatabaseErrorLike {
  return typeof error === "object" && error !== null ? error as DatabaseErrorLike : {};
}

function logUnexpectedError(context: string, requestId: string, error: unknown) {
  const details = databaseErrorDetails(error);

  console.error("[api] request failed", {
    correlationId: requestId,
    context,
    errorName: error instanceof Error ? error.name : undefined,
    code: typeof details.code === "string" ? details.code : undefined,
    message:
      error instanceof Error
        ? error.message
        : typeof details.message === "string"
          ? details.message
          : "Unknown error",
    details: typeof details.details === "string" ? details.details : undefined,
    hint: typeof details.hint === "string" ? details.hint : undefined,
  });
}

export function apiErrorResponse(error: unknown, context: string) {
  const requestId = correlationId();

  if (error instanceof ApiResultLimitError) {
    return jsonNoStore(
      { message: error.message, correlationId: requestId },
      { status: 413 }
    );
  }

  const details = databaseErrorDetails(error);
  const code = typeof details.code === "string" ? details.code : undefined;

  switch (code) {
    case "22023":
    case "22003":
      return jsonNoStore(
        { message: "Data permintaan tidak valid.", correlationId: requestId },
        { status: 400 }
      );
    case "P0002":
      return jsonNoStore(
        { message: "Data tidak ditemukan.", correlationId: requestId },
        { status: 404 }
      );
    case "23505":
      return jsonNoStore(
        {
          message: "Data berkonflik dengan data yang sudah ada.",
          correlationId: requestId,
        },
        { status: 409 }
      );
    case "55000":
      return jsonNoStore(
        {
          message: "Operasi tidak dapat dilakukan pada kondisi data saat ini.",
          correlationId: requestId,
        },
        { status: 409 }
      );
    case "40001":
      return jsonNoStore(
        {
          message: "Data berubah secara bersamaan. Silakan ulangi permintaan.",
          hint: "Coba ulangi beberapa saat lagi; untuk checkout gunakan payload dan Idempotency-Key yang sama.",
          correlationId: requestId,
        },
        { status: 409, headers: { "Retry-After": "1" } }
      );
    default:
      logUnexpectedError(context, requestId, error);
      return jsonNoStore(
        {
          message: "Terjadi kesalahan internal. Hubungi administrator jika masalah berlanjut.",
          correlationId: requestId,
        },
        { status: 500 }
      );
  }
}

export function actorFromSession(user: {
  id: string;
  name?: string | null;
  username?: string;
}) {
  const actorId = user.id.trim();
  const actorName = (user.name?.trim() || user.username?.trim() || actorId).slice(0, 200);

  return {
    p_actor_id: actorId,
    p_actor_name: actorName,
  };
}
