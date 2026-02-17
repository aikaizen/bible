import { NextResponse } from "next/server";

import { ServiceError } from "./service";

export function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof ServiceError) {
    return badRequest(error.message, error.status);
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return badRequest(message, 500);
}

export async function parseBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}
