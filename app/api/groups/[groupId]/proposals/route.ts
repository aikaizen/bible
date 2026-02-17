import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { addProposal, removeProposal } from "@/lib/service";

type ProposalBody = {
  reference: string;
  note?: string;
};

type DeleteProposalBody = {
  proposalId: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const body = await parseBody<ProposalBody>(request);

    if (!body.reference) {
      return badRequest("reference is required", 422);
    }

    const data = await addProposal({
      groupId,
      userId: user.id,
      reference: body.reference,
      note: body.note,
    });

    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const body = await parseBody<DeleteProposalBody>(request);

    if (!body.proposalId) {
      return badRequest("proposalId is required", 422);
    }

    const data = await removeProposal({ groupId, userId: user.id, proposalId: body.proposalId });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
