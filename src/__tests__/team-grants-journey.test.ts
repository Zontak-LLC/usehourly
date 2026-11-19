import { beforeAll, describe, expect, it, vi } from "vitest";

import { log, world } from "./helpers/team-world";

beforeAll(() => {
  vi.stubEnv("AUTH_SECRET", "test-secret-for-signed-links");
});

/** Ada invites Sam on `clientIds` and Sam accepts, so Sam can log time on what is granted. */
async function samJoins(clientIds: string[]) {
  const w = world();
  const { id, token } = await w.as("ada").team.invite({ email: "sam@example.com", name: "Sam", clientIds });
  await w.as("sam").member.accept({ token });
  return { w, id };
}

describe("the owner changes which clients a team member may log time on", () => {
  it("a failed add keeps the member's old clients, so they can still log time", async () => {
    const { w, id } = await samJoins(["acme"]);
    w.grantFails.createMany = true;

    await expect(w.as("ada").team.setClients({ id, clientIds: ["acme", "beta"] })).rejects.toThrow();

    expect(w.grants).toEqual([{ team_member_id: id, client_id: "acme" }]);
    const entry = await w.as("sam").member.log(log({ teamId: id, projectId: "web" }));
    expect(entry).toMatchObject({ user_id: "ada", author_id: "sam", project_id: "web", minutes: 90 });
  });

  it("a failed remove keeps the old and the new clients: briefly too much access, never none", async () => {
    const { w, id } = await samJoins(["acme"]);
    w.grantFails.deleteMany = true;

    await expect(w.as("ada").team.setClients({ id, clientIds: ["beta"] })).rejects.toThrow();

    expect(w.grants).toEqual([
      { team_member_id: id, client_id: "acme" },
      { team_member_id: id, client_id: "beta" },
    ]);
    const entry = await w.as("sam").member.log(log({ teamId: id, projectId: "app" }));
    expect(entry).toMatchObject({ user_id: "ada", author_id: "sam", project_id: "app", minutes: 90 });
  });

  it("adding a client inserts only the new one and removes nothing", async () => {
    const { w, id } = await samJoins(["acme"]);

    expect(await w.as("ada").team.setClients({ id, clientIds: ["acme", "beta"] })).toEqual({
      id,
      clientIds: ["acme", "beta"],
    });

    expect(w.prisma.teamMemberClient.createMany).toHaveBeenCalledTimes(1);
    expect(w.prisma.teamMemberClient.createMany).toHaveBeenCalledWith({
      data: [{ team_member_id: id, client_id: "beta" }],
    });
    expect(w.prisma.teamMemberClient.deleteMany).not.toHaveBeenCalled();
    expect(w.grants).toEqual([
      { team_member_id: id, client_id: "acme" },
      { team_member_id: id, client_id: "beta" },
    ]);
  });

  it("dropping a client removes only the dropped one and inserts nothing", async () => {
    const { w, id } = await samJoins(["acme", "beta"]);

    expect(await w.as("ada").team.setClients({ id, clientIds: ["beta"] })).toEqual({ id, clientIds: ["beta"] });

    expect(w.prisma.teamMemberClient.createMany).not.toHaveBeenCalled();
    expect(w.prisma.teamMemberClient.deleteMany).toHaveBeenCalledTimes(1);
    expect(w.prisma.teamMemberClient.deleteMany).toHaveBeenCalledWith({
      where: { team_member_id: id, client_id: { notIn: ["beta"] } },
    });
    expect(w.grants).toEqual([{ team_member_id: id, client_id: "beta" }]);
  });

  it("saving the same clients again writes nothing", async () => {
    const { w, id } = await samJoins(["acme"]);

    expect(await w.as("ada").team.setClients({ id, clientIds: ["acme", "acme"] })).toEqual({
      id,
      clientIds: ["acme"],
    });

    expect(w.prisma.teamMemberClient.createMany).not.toHaveBeenCalled();
    expect(w.prisma.teamMemberClient.deleteMany).not.toHaveBeenCalled();
    expect(w.grants).toEqual([{ team_member_id: id, client_id: "acme" }]);
  });

  it("someone else's person or someone else's client is refused before any grant is read or written", async () => {
    const { w, id } = await samJoins(["acme"]);

    await expect(w.as("zed").team.setClients({ id, clientIds: ["zco"] })).rejects.toThrow(/Person not found/);
    await expect(w.as("ada").team.setClients({ id, clientIds: ["acme", "zco"] })).rejects.toThrow(/Client not found/);

    expect(w.prisma.teamMemberClient.findMany).not.toHaveBeenCalled();
    expect(w.prisma.teamMemberClient.createMany).not.toHaveBeenCalled();
    expect(w.prisma.teamMemberClient.deleteMany).not.toHaveBeenCalled();
    expect(w.grants).toEqual([{ team_member_id: id, client_id: "acme" }]);
  });
});
