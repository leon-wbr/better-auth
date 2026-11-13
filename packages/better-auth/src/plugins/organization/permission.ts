import type { Role, Statements } from "../access";
import { parseRoleList } from "./roles";
import type { OrganizationOptions } from "./types";

export const hasPermissionFn = (
	input: HasPermissionBaseInput,
	acRoles: {
		[x: string]: Role<Statements> | undefined;
	},
) => {
	if (!input.permissions) return false;

	const roles = parseRoleList(input.role);
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permissions);
		if (result?.success) {
			return true;
		}
	}
	return (input.grants ?? []).some(
		(grant) => grant.authorize(input.permissions).success,
	);
};

export type PermissionExclusive = {
	permissions: { [key: string]: string[] };
};

export type HasPermissionBaseInput = {
	role: string;
	options: OrganizationOptions;
	allowCreatorAllPermissions?: boolean | undefined;
	/**
	 * Roles of the grants that apply to the caller, from `getCallerAccess`.
	 */
	grants?: Role<Statements>[] | undefined;
} & PermissionExclusive;
