import { z } from "zod";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IMEI_PRESENTATION_PATTERN = /^[0-9\s-]+$/;
const SEARCH_PATTERN = /^[\p{L}\p{M}\p{N} @'’+&\/-]+$/u;

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function requiredText(field: string, maxLength = 200) {
  return z
    .string({ error: `${field} wajib berupa teks.` })
    .trim()
    .min(1, `${field} wajib diisi.`)
    .max(maxLength, `${field} maksimal ${maxLength} karakter.`)
    .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value), {
      message: `${field} mengandung karakter kontrol yang tidak diizinkan.`,
    });
}

const numericInputSchema = z.union([
  z.number(),
  z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, "Nilai uang harus menggunakan format angka desimal."),
]);

function positiveMoney(field: string) {
  return numericInputSchema.transform((value, context) => {
    const parsed = typeof value === "number" ? value : Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      context.addIssue({
        code: "custom",
        message: `${field} harus berupa angka finite dan lebih dari nol.`,
      });
      return z.NEVER;
    }

    if (parsed > 999_999_999_999.99) {
      context.addIssue({
        code: "custom",
        message: `${field} melebihi batas numeric(14,2).`,
      });
      return z.NEVER;
    }

    const [coefficient, exponentText] = parsed.toString().toLowerCase().split("e");
    const decimalDigits = coefficient.split(".")[1]?.length ?? 0;
    const exponent = exponentText ? Number(exponentText) : 0;

    if (decimalDigits - exponent > 2) {
      context.addIssue({
        code: "custom",
        message: `${field} maksimal memiliki dua angka desimal.`,
      });
      return z.NEVER;
    }

    return parsed;
  });
}

export const dateOnlySchema = z
  .string({ error: "Tanggal wajib berupa teks." })
  .refine(isCalendarDate, "Format tanggal harus YYYY-MM-DD dan berupa tanggal valid.");

export const idParamSchema = z.uuid({ error: "ID tidak valid." });

export const stockInMutationSchema = z
  .object({
    type: requiredText("type"),
    imei: z
      .string({ error: "IMEI wajib berupa teks." })
      .trim()
      .min(1, "IMEI wajib diisi.")
      .max(128, "IMEI tidak valid.")
      .regex(IMEI_PRESENTATION_PATTERN, "IMEI hanya boleh berisi digit, spasi, atau tanda hubung.")
      .refine((value) => value.replace(/[\s-]+/g, "").length === 15, {
        message: "IMEI harus berisi tepat 15 digit.",
      }),
    harga: positiveMoney("harga"),
    penjual: requiredText("penjual"),
    tanggal_masuk: dateOnlySchema,
  })
  .strict();

export const stockOutCheckoutSchema = z
  .object({
    imei: z
      .string({ error: "IMEI wajib berupa teks." })
      .trim()
      .min(1, "IMEI wajib diisi.")
      .max(128, "IMEI tidak valid.")
      .regex(IMEI_PRESENTATION_PATTERN, "IMEI hanya boleh berisi digit, spasi, atau tanda hubung.")
      .refine((value) => value.replace(/[\s-]+/g, "").length === 15, {
        message: "IMEI harus berisi tepat 15 digit.",
      }),
    pembeli: requiredText("pembeli"),
    harga_jual: positiveMoney("harga_jual"),
    tanggal_keluar: dateOnlySchema,
  })
  .strict();

export const stockOutUpdateSchema = z
  .object({
    pembeli: requiredText("pembeli"),
    harga_jual: positiveMoney("harga_jual"),
    tanggal_keluar: dateOnlySchema,
  })
  .strict();

export const idempotencyKeySchema = z
  .string({ error: "Header Idempotency-Key wajib diisi." })
  .trim()
  .min(16, "Header Idempotency-Key minimal 16 karakter.")
  .max(200, "Header Idempotency-Key maksimal 200 karakter.")
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Header Idempotency-Key tidak valid.")
  .refine(
    (value) =>
      z.uuid().safeParse(value).success ||
      (value.length >= 24 && /[A-Za-z]/.test(value) && /[0-9]/.test(value)),
    "Header Idempotency-Key harus berupa UUID atau string kuat minimal 24 karakter yang mengandung huruf dan angka."
  );

const optionalDateQuerySchema = z.preprocess(
  (value) => value === null || value === "" ? undefined : value,
  dateOnlySchema.optional()
);

const optionalSearchQuerySchema = z.preprocess(
  (value) => value === null || value === "" ? undefined : value,
  requiredText("search", 100)
    .refine((value) => SEARCH_PATTERN.test(value), {
      message: "search mengandung karakter yang tidak diizinkan.",
    })
    .optional()
);

const positiveIntegerQuery = (field: string, maximum: number) =>
  z.preprocess(
    (value) => value === null || value === "" ? undefined : value,
    z
      .string({ error: `${field} harus berupa angka.` })
      .regex(/^[1-9]\d*$/, `${field} harus berupa bilangan bulat positif.`)
      .transform(Number)
      .pipe(z.number().safe().max(maximum, `${field} maksimal ${maximum}.`))
      .optional()
  );

const paginatedQuerySchema = z.preprocess(
  (value) => value === null || value === "" ? undefined : value,
  z.enum(["0", "1"], { error: "paginated harus 0 atau 1." }).optional()
);

export const listQuerySchema = z
  .object({
    page: positiveIntegerQuery("page", 1_000_000),
    pageSize: positiveIntegerQuery("pageSize", 100),
    from: optionalDateQuerySchema,
    to: optionalDateQuerySchema,
    search: optionalSearchQuerySchema,
    paginated: paginatedQuerySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: "Tanggal from tidak boleh setelah to.",
      });
    }
  })
  .transform((value) => ({
    page: value.page ?? 1,
    pageSize: value.pageSize ?? 25,
    from: value.from,
    to: value.to,
    search: value.search,
    paginated: value.paginated === "1",
  }));

export const stockListQuerySchema = z
  .object({
    page: positiveIntegerQuery("page", 1_000_000),
    pageSize: positiveIntegerQuery("pageSize", 100),
    search: optionalSearchQuerySchema,
    paginated: paginatedQuerySchema,
    status: z.preprocess(
      (value) => value === null || value === "" ? undefined : value,
      z.enum(["available", "sold", "all"], {
        error: "status harus available, sold, atau all.",
      }).optional()
    ),
  })
  .strict()
  .transform((value) => ({
    page: value.page ?? 1,
    pageSize: value.pageSize ?? 25,
    search: value.search,
    paginated: value.paginated === "1",
    status: value.status ?? "available",
  }));

export const activityListQuerySchema = z
  .object({
    page: positiveIntegerQuery("page", 1_000_000),
    pageSize: positiveIntegerQuery("pageSize", 100),
    from: optionalDateQuerySchema,
    to: optionalDateQuerySchema,
    search: optionalSearchQuerySchema,
    paginated: paginatedQuerySchema,
    module: z.preprocess(
      (value) => value === null || value === "" ? undefined : value,
      requiredText("module", 100).optional()
    ),
    action: z.preprocess(
      (value) => value === null || value === "" ? undefined : value,
      requiredText("action", 100).optional()
    ),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: "Tanggal from tidak boleh setelah to.",
      });
    }
  })
  .transform((value) => ({
    page: value.page ?? 1,
    pageSize: value.pageSize ?? 25,
    from: value.from,
    to: value.to,
    search: value.search,
    paginated: value.paginated === "1",
    module: value.module,
    action: value.action,
  }));

export const dashboardQuerySchema = z
  .object({
    from: optionalDateQuerySchema,
    to: optionalDateQuerySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: "Tanggal from tidak boleh setelah to.",
      });
    }
  });

export type PaginationQuery = z.infer<typeof listQuerySchema>;
