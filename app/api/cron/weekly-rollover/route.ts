import { badRequest, handleRouteError, ok } from "@/lib/api";
import { runWeeklyRollover } from "@/lib/service";

type CronBody = {
  groupId?: string;
};

function isAuthorized(request: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) {
    return false;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;

  return headerSecret === configured || bearer === configured;
}

function getGroupIdFromQuery(request: Request): string | undefined {
  const url = new URL(request.url);
  return url.searchParams.get("groupId") ?? undefined;
}

export async function GET(request: Request) {
  try {
    if (!process.env.CRON_SECRET) {
      return badRequest("CRON_SECRET is not configured", 500);
    }
    if (!isAuthorized(request)) {
      return badRequest("Unauthorized", 401);
    }

    const groupId = getGroupIdFromQuery(request);
    const data = await runWeeklyRollover({ groupId });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!process.env.CRON_SECRET) {
      return badRequest("CRON_SECRET is not configured", 500);
    }
    if (!isAuthorized(request)) {
      return badRequest("Unauthorized", 401);
    }

    const raw = await request.text();
    const body = raw ? (JSON.parse(raw) as CronBody) : {};
    const data = await runWeeklyRollover({ groupId: body.groupId });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
