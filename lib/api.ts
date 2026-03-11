import { NextResponse } from "next/server";

import { ServiceError } from "./service";

export function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return badRequest("Unauthorized", 401);
  }
  if (error instanceof ServiceError) {
    return badRequest(error.message, error.status);
  }

  console.error("Unhandled route error", error);
  return badRequest("Unexpected server error", 500);
}

export async function parseBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}
