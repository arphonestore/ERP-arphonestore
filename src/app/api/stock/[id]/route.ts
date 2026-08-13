import { methodNotAllowed } from "@/lib/api/http";

export async function PUT() {
  return methodNotAllowed(["GET"]);
}

export async function DELETE() {
  return methodNotAllowed(["GET"]);
}
