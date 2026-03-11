import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ServiceError,
  cancelInvite,
  createGroup,
  createInvite,
  createPersonalInvite,
  getGroupSnapshot,
  getInviteByToken,
  joinGroupByInvite,
} from "@/lib/service";
import { addGroupMember, createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("service security hardening", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.close();
  });

  it("rejects invalid timezone on group creation", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-tz@example.com" });

    await expect(
      createGroup({
        name: "Bad TZ Group",
        timezone: "Mars/Olympus_Mons",
        ownerId,
      }),
    ).rejects.toMatchObject({
      message: "Invalid timezone",
    });
  });

  it("blocks joining cancelled invites", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-cancel@example.com" });
    const joinerId = await createUser(testDb.pool, { name: "Joiner", email: "joiner-cancel@example.com" });

    const group = await createGroup({
      name: "Cancel Invite Group",
      timezone: "America/New_York",
      ownerId,
    });

    const created = await createInvite({ groupId: group.groupId!, userId: ownerId });
    const inviteRow = await testDb.pool.query<{ id: string }>(
      "SELECT id FROM invites WHERE token = $1",
      [created.token],
    );

    await cancelInvite({
      inviteId: inviteRow.rows[0].id,
      groupId: group.groupId!,
      userId: ownerId,
    });

    await expect(joinGroupByInvite({ token: created.token, userId: joinerId })).rejects.toMatchObject({
      message: "Invite is invalid, expired, or already used",
    });

    const byToken = await getInviteByToken(created.token);
    expect(byToken).toBeNull();
  });

  it("allows personal invite only once", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-personal@example.com" });
    const joinerAId = await createUser(testDb.pool, { name: "Joiner A", email: "joiner-a@example.com" });
    const joinerBId = await createUser(testDb.pool, { name: "Joiner B", email: "joiner-b@example.com" });

    const group = await createGroup({
      name: "Personal Invite Group",
      timezone: "America/New_York",
      ownerId,
    });

    const created = await createPersonalInvite({
      groupId: group.groupId!,
      userId: ownerId,
      recipientName: "Friend",
      recipientContact: "friend@example.com",
    });

    await joinGroupByInvite({ token: created.token, userId: joinerAId });

    await expect(joinGroupByInvite({ token: created.token, userId: joinerBId })).rejects.toMatchObject({
      message: "Invite is invalid, expired, or already used",
    });

    const invite = await testDb.pool.query<{ status: string; accepted_by: string | null }>(
      "SELECT status, accepted_by FROM invites WHERE token = $1",
      [created.token],
    );
    expect(invite.rows[0].status).toBe("accepted");
    expect(invite.rows[0].accepted_by).toBe(joinerAId);
  });

  it("redacts personal invite token/contact for non-admin, non-inviter members", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-redact@example.com" });
    const inviterId = await createUser(testDb.pool, { name: "Inviter", email: "inviter-redact@example.com" });
    const memberId = await createUser(testDb.pool, { name: "Member", email: "member-redact@example.com" });

    const group = await createGroup({
      name: "Redaction Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: inviterId, role: "MEMBER" });
    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberId, role: "MEMBER" });

    const created = await createPersonalInvite({
      groupId: group.groupId!,
      userId: inviterId,
      recipientName: "Target",
      recipientContact: "target@example.com",
    });

    const inviterSnapshot = await getGroupSnapshot(group.groupId!, inviterId);
    const memberSnapshot = await getGroupSnapshot(group.groupId!, memberId);
    const ownerSnapshot = await getGroupSnapshot(group.groupId!, ownerId);

    expect(inviterSnapshot.pendingInvites.length).toBeGreaterThan(0);
    expect(inviterSnapshot.pendingInvites[0].token).toBe(created.token);
    expect(inviterSnapshot.pendingInvites[0].recipientContact).toBe("target@example.com");

    expect(memberSnapshot.pendingInvites.length).toBeGreaterThan(0);
    expect(memberSnapshot.pendingInvites[0].token).toBeNull();
    expect(memberSnapshot.pendingInvites[0].recipientContact).toBeNull();

    expect(ownerSnapshot.pendingInvites.length).toBeGreaterThan(0);
    expect(ownerSnapshot.pendingInvites[0].token).toBe(created.token);
  });

  it("returns service errors with expected status class", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-status@example.com" });

    const group = await createGroup({
      name: "Status Group",
      timezone: "America/New_York",
      ownerId,
    });

    const created = await createInvite({ groupId: group.groupId!, userId: ownerId });
    const inviteRow = await testDb.pool.query<{ id: string }>(
      "SELECT id FROM invites WHERE token = $1",
      [created.token],
    );

    await cancelInvite({
      inviteId: inviteRow.rows[0].id,
      groupId: group.groupId!,
      userId: ownerId,
    });

    try {
      await joinGroupByInvite({ token: created.token, userId: ownerId });
      throw new Error("Expected joinGroupByInvite to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).status).toBe(404);
    }
  });
});
