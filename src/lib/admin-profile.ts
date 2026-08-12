const legacyAdminNames = new Set(["admin mkr store", "admin mrk store"]);

export function normalizeAdminFullName(value: string | null | undefined) {
  if (value && legacyAdminNames.has(value.trim().toLowerCase())) {
    return "Admin AR Store";
  }

  return value;
}
