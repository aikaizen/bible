import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { getProposalComments, createProposalComment } from "@/lib/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ proposalId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { proposalId } = await context.params;
    const comments = await getProposalComments(proposalId, user.id);
    return ok({ comments });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ proposalId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { proposalId } = await context.params;
    const body = await parseBody<{ text: string }>(request);
    const data = await createProposalComment({
      proposalId,
      userId: user.id,
      text: body.text,
    });
    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
