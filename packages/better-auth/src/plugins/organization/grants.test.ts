import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin } from "../admin";
import { organization } from ".";
import { defaultAc } from "./access";
import type { OrganizationOptions } from "./types";

const STAFF_EMAIL = "staff@test.com";
const PASSWORD = "password123";

async function setup(grants?: OrganizationOptions["grants"]) {
	const { auth, client, db, signInWithTestUser, signInWithUser } =
		await getTestInstance({
			plugins: [admin(), organization({ grants })],
		});
	const owner = await signInWithTestUser();
	const org = await auth.api.createOrganization({
		body: { name: "Acme", slug: "acme" },
		headers: owner.headers,
	});
	const otherOrg = await auth.api.createOrganization({
		body: { name: "Other", slug: "other" },
		headers: owner.headers,
	});
	const { data } = await client.signUp.email({
		email: STAFF_EMAIL,
		password: PASSWORD,
		name: "Staff",
	});
	await db.update({
		model: "user",
		where: [{ field: "id", value: data!.user.id }],
		update: { role: "admin" },
	});
	const staff = await signInWithUser(STAFF_EMAIL, PASSWORD);
	return {
		auth,
		owner: owner.headers,
		staff: staff.headers,
		staffId: data!.user.id,
		org,
		otherOrg,
	};
}

describe("organization grants", () => {
	it("changes nothing without grants", async () => {
		const { auth, staff, org } = await setup();
		await expect(
			auth.api.setActiveOrganization({
				body: { organizationId: org.id },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
		await expect(
			auth.api.updateOrganization({
				body: { organizationId: org.id, data: { name: "Renamed" } },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });
	});

	it("lets a platform admin update and delete any organization, and nothing else", async () => {
		const { auth, staff, org, otherOrg } = await setup([
			{
				when: ({ user }) => user.role === "admin",
				role: defaultAc.newRole({ organization: ["update", "delete"] }),
			},
		]);

		const updated = await auth.api.updateOrganization({
			body: { organizationId: org.id, data: { name: "Renamed" } },
			headers: staff,
		});
		expect(updated?.name).toBe("Renamed");

		await expect(
			auth.api.createInvitation({
				body: { organizationId: org.id, email: "new@test.com", role: "member" },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });

		const check = await auth.api.hasPermission({
			body: {
				organizationId: org.id,
				permissions: { organization: ["delete"] },
			},
			headers: staff,
		});
		expect(check.success).toBe(true);
		const denied = await auth.api.hasPermission({
			body: { organizationId: org.id, permissions: { member: ["delete"] } },
			headers: staff,
		});
		expect(denied.success).toBe(false);

		await auth.api.deleteOrganization({
			body: { organizationId: otherOrg.id },
			headers: staff,
		});
		await expect(
			auth.api.getFullOrganization({
				query: { organizationId: otherOrg.id },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });
	});

	it("gives a granted user access to the organization, but no membership", async () => {
		const { auth, staff, org } = await setup([
			{
				when: ({ user }) => user.role === "admin",
				role: defaultAc.newRole({ organization: ["update"] }),
			},
		]);
		const active = await auth.api.setActiveOrganization({
			body: { organizationId: org.id },
			headers: staff,
		});
		expect(active?.id).toBe(org.id);

		const full = await auth.api.getFullOrganization({ headers: staff });
		expect(full?.id).toBe(org.id);
		expect(full?.invitations).toEqual([]);

		await expect(
			auth.api.getActiveMember({ headers: staff }),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });
	});

	it("scopes a grant to one user and one organization", async () => {
		const scope = { userId: "", organizationId: "" };
		const { auth, staff, staffId, org, otherOrg } = await setup([
			{
				when: ({ user, organizationId }) =>
					user.id === scope.userId && organizationId === scope.organizationId,
				role: defaultAc.newRole({ invitation: ["create"] }),
			},
		]);
		scope.userId = staffId;
		scope.organizationId = org.id;
		const invitation = await auth.api.createInvitation({
			body: { organizationId: org.id, email: "new@test.com", role: "member" },
			headers: staff,
		});
		expect(invitation.organizationId).toBe(org.id);

		await expect(
			auth.api.createInvitation({
				body: {
					organizationId: otherOrg.id,
					email: "new@test.com",
					role: "member",
				},
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "BAD_REQUEST" });

		await expect(
			auth.api.createInvitation({
				body: {
					organizationId: org.id,
					email: "owner@test.com",
					role: "owner",
				},
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
	});

	it("adds to the permissions of a real member", async () => {
		const { auth, owner, staff, staffId, org } = await setup([
			{
				when: ({ user }) => user.email === STAFF_EMAIL,
				role: defaultAc.newRole({ organization: ["update"] }),
			},
		]);
		await auth.api.addMember({
			body: { organizationId: org.id, userId: staffId, role: "member" },
		});
		const updated = await auth.api.updateOrganization({
			body: { organizationId: org.id, data: { name: "Renamed" } },
			headers: staff,
		});
		expect(updated?.name).toBe("Renamed");

		await expect(
			auth.api.deleteOrganization({
				body: { organizationId: org.id },
				headers: staff,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });

		const member = await auth.api.getActiveMember({
			headers: owner,
		});
		expect(member.role).toBe("owner");
	});

	it("types grants by the access control statements", () => {
		const grants: OrganizationOptions["grants"] = [
			{
				when: () => true,
				// @ts-expect-error unknown action
				role: defaultAc.newRole({ organization: ["fly"] }),
			},
			{
				when: () => true,
				// @ts-expect-error unknown resource
				role: defaultAc.newRole({ spaceship: ["create"] }),
			},
		];
		expect(grants).toHaveLength(2);
	});
});
