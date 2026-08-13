const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const jakartaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: JAKARTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function jakartaDate(now = new Date()) {
  const parts = jakartaDateFormatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Tanggal Asia/Jakarta tidak dapat diformat.");
  }

  return `${year}-${month}-${day}`;
}

export function jakartaYear(now = new Date()) {
  return Number(jakartaDate(now).slice(0, 4));
}

export function monthRange(periodKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || month < 1 || month > 12) return null;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(daysInMonth)}`,
    year,
    month,
  };
}

export function previousMonthRange(date: string) {
  if (!DATE_PATTERN.test(date)) return null;

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return monthRange(`${previous.getUTCFullYear()}-${pad2(previous.getUTCMonth() + 1)}`);
}

export function defaultJakartaRange(now = new Date()) {
  const today = jakartaDate(now);
  return {
    from: `${today.slice(0, 7)}-01`,
    to: today,
  };
}

export function startOfNextDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

export function periodLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}
