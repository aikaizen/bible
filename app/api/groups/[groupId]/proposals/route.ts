import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { addProposal, removeProposal } from "@/lib/service";

type ProposalBody = {
  userId: string;
  reference: string;
  note?: string;
};

type DeleteProposalBody = {
  userId: string;
  proposalId: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await context.params;
    const body = await parseBody<ProposalBody>(request);

    if (!body.userId || !body.reference) {
      return badRequest("userId and reference are required", 422);
    }

    const data = await addProposal({
      groupId,
      userId: body.userId,
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
    const { groupId } = await context.params;
    const body = await parseBody<DeleteProposalBody>(request);

    if (!body.userId || !body.proposalId) {
      return badRequest("userId and proposalId are required", 422);
    }

    const data = await removeProposal({ groupId, userId: body.userId, proposalId: body.proposalId });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
