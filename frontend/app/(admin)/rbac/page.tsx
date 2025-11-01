"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import RolesTable from "@/components/RolesTable";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import {
	attachPermission,
	checkPermission,
	createRole,
	deleteRole,
	detachPermission,
	fetchPermissions,
	fetchRoles,
	fetchUserRoles,
	grantRole,
	revokeRole,
} from "@/lib/rbac";
import type { PermissionRow, RoleRow, UserRoleRow } from "@/lib/types";

export default function AdminRbacPage() {
	const adminId = getDemoUserId();
	const campusId = getDemoCampusId();
	const [permissions, setPermissions] = useState<PermissionRow[]>([]);
	const [roles, setRoles] = useState<RoleRow[]>([]);
	const [selectedRole, setSelectedRole] = useState<string | null>(null);
	const [busy, setBusy] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [targetUser, setTargetUser] = useState<string>("");
	const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);
	const [canManageUsers, setCanManageUsers] = useState<boolean>(true);

	const loadCatalog = useCallback(async () => {
		setError(null);
		try {
			const [perms, roleList] = await Promise.all([
				fetchPermissions(adminId, campusId),
				fetchRoles(adminId, campusId),
			]);
			setPermissions(perms);
			setRoles(roleList);
			if (roleList.length > 0 && !selectedRole) {
				setSelectedRole(roleList[0].id);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load RBAC data");
		}
	}, [adminId, campusId, selectedRole]);

	useEffect(() => {
		void loadCatalog();
	}, [loadCatalog]);

	useEffect(() => {
		(async () => {
			try {
				const allowed = await checkPermission("identity.rbac.grant", adminId, campusId);
				setCanManageUsers(allowed);
			} catch {
				setCanManageUsers(false);
			}
		})();
	}, [adminId, campusId]);

	const handleAttach = async (roleId: string, permissionId: string) => {
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const updated = await attachPermission(adminId, roleId, permissionId, campusId);
			setRoles((current) => current.map((role) => (role.id === updated.id ? updated : role)));
			setSuccess("Permission attached");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to attach permission");
		} finally {
			setBusy(false);
		}
	};

	const handleDetach = async (roleId: string, permissionId: string) => {
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const updated = await detachPermission(adminId, roleId, permissionId, campusId);
			setRoles((current) => current.map((role) => (role.id === updated.id ? updated : role)));
			setSuccess("Permission removed");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove permission");
		} finally {
			setBusy(false);
		}
	};

	const handleCreateRole = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const name = String(formData.get("name") ?? "").trim();
		const description = String(formData.get("description") ?? "").trim();
		if (!name) {
			setError("Role name is required");
			return;
		}
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const role = await createRole(adminId, { name, description }, campusId);
			setRoles((current) => [...current, role].sort((a, b) => a.name.localeCompare(b.name)));
			setSelectedRole(role.id);
			setSuccess("Role created");
			event.currentTarget.reset();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create role");
		} finally {
			setBusy(false);
		}
	};

	const handleDeleteRole = async (roleId: string) => {
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			await deleteRole(adminId, roleId, campusId);
			setRoles((current) => current.filter((role) => role.id !== roleId));
			if (selectedRole === roleId) {
				setSelectedRole(null);
			}
			setSuccess("Role deleted");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete role");
		} finally {
			setBusy(false);
		}
	};

	const handleLoadUserRoles = async () => {
		if (!targetUser.trim()) {
			return;
		}
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const grants = await fetchUserRoles(targetUser.trim(), adminId, campusId);
			setUserRoles(grants);
			setSuccess("Fetched user roles");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load user roles");
		} finally {
			setBusy(false);
		}
	};

	const handleGrantUser = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!targetUser.trim() || !selectedRole) {
			setError("Select a role and enter a user ID");
			return;
		}
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const grants = await grantRole(adminId, targetUser.trim(), { role_id: selectedRole }, campusId);
			setUserRoles(grants);
			setSuccess("Role granted");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to grant role");
		} finally {
			setBusy(false);
		}
	};

	const handleRevokeUserRole = async (roleId: string, campus: string | null) => {
		if (!targetUser) {
			return;
		}
		setBusy(true);
		setError(null);
		setSuccess(null);
		try {
			const grants = await revokeRole(adminId, targetUser, { role_id: roleId, campus_id: campus }, campusId);
			setUserRoles(grants);
			setSuccess("Role revoked");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke role");
		} finally {
			setBusy(false);
		}
	};

	const selectedRoleName = useMemo(() => roles.find((role) => role.id === selectedRole)?.name ?? "", [roles, selectedRole]);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-slate-900">RBAC administration</h1>
				<p className="text-sm text-slate-600">
					Manage role definitions, attach permissions, and grant scoped access to users. Changes take effect immediately and
					are cached for 15 minutes.
				</p>
			</header>
			{error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
			{success ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}
			<section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Create role</h2>
				<form onSubmit={handleCreateRole} className="mt-3 grid gap-3 sm:grid-cols-2">
					<label className="text-sm">
						<span className="text-slate-600">Name</span>
						<input name="name" type="text" className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="identity.moderator" />
					</label>
					<label className="text-sm sm:col-span-2">
						<span className="text-slate-600">Description</span>
						<input name="description" type="text" className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Moderation controls" />
					</label>
					<div className="sm:col-span-2">
						<button type="submit" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
							{busy ? "Saving…" : "Create role"}
						</button>
					</div>
				</form>
			</section>
			<RolesTable
				roles={roles}
				permissions={permissions}
				selectedRoleId={selectedRole}
				onSelectRole={setSelectedRole}
				onAttachPermission={handleAttach}
				onDetachPermission={handleDetach}
				busy={busy}
			/>
			{selectedRole ? (
				<button
					type="button"
					onClick={() => void handleDeleteRole(selectedRole)}
					disabled={busy}
					className="self-start rounded bg-rose-100 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-200 disabled:opacity-50"
				>
					Delete selected role
				</button>
			) : null}
			<section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
				<header className="mb-3 flex items-center justify-between">
					<div>
						<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">User grants</h2>
						<p className="text-xs text-slate-500">Assign roles to a specific user. Campus scope defaults to your current campus.</p>
					</div>
					<button
						type="button"
						onClick={() => void handleLoadUserRoles()}
						disabled={busy || !targetUser || !canManageUsers}
						className="rounded bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
					>
						Refresh grants
					</button>
				</header>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="text-sm">
						<span className="text-slate-600">User ID</span>
						<input
							type="text"
							value={targetUser}
							onChange={(event) => setTargetUser(event.target.value)}
							className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
							placeholder="user-123"
						/>
					</label>
					<label className="text-sm">
						<span className="text-slate-600">Selected role</span>
						<input value={selectedRoleName || "—"} readOnly className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
					</label>
				</div>
				<form onSubmit={handleGrantUser} className="mt-3 flex items-center gap-3">
					<button type="submit" disabled={busy || !canManageUsers || !selectedRole || !targetUser} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
						{busy ? "Updating…" : "Grant role"}
					</button>
				</form>
				{userRoles.length > 0 ? (
					<table className="mt-4 min-w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50">
							<tr>
								<th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
								<th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Scope</th>
								<th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Granted</th>
								<th className="px-3 py-2" />
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200">
							{userRoles.map((assignment) => (
								<tr key={`${assignment.role_id}:${assignment.campus_id ?? "global"}`}>
									<td className="px-3 py-2 text-slate-700">{assignment.role_name}</td>
									<td className="px-3 py-2 text-slate-500">{assignment.campus_id ?? "Global"}</td>
									<td className="px-3 py-2 text-xs text-slate-500">{new Date(assignment.created_at).toLocaleString()}</td>
									<td className="px-3 py-2 text-right">
										<button
											type="button"
											disabled={busy}
											onClick={() => void handleRevokeUserRole(assignment.role_id, assignment.campus_id ?? null)}
											className="rounded bg-rose-100 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-200 disabled:opacity-50"
										>
											Revoke
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<p className="mt-3 text-sm text-slate-500">Select a user to view their current grants.</p>
				)}
			</section>
		</main>
	);
}
