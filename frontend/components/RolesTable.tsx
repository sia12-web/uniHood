"use client";

import React, { useEffect, useMemo, useState } from "react";

import type { PermissionRow, RoleRow } from "@/lib/types";

interface RolesTableProps {
	roles: RoleRow[];
	permissions: PermissionRow[];
	selectedRoleId?: string | null;
	onSelectRole?: (roleId: string) => void;
	onAttachPermission?: (roleId: string, permissionId: string) => Promise<void> | void;
	onDetachPermission?: (roleId: string, permissionId: string) => Promise<void> | void;
	busy?: boolean;
}

export default function RolesTable({
	roles,
	permissions,
	selectedRoleId,
	onSelectRole,
	onAttachPermission,
	onDetachPermission,
	busy = false,
}: RolesTableProps) {
	const [activeRole, setActiveRole] = useState<string | null>(selectedRoleId ?? null);
	const [attachValue, setAttachValue] = useState<string>("");
	const [attaching, setAttaching] = useState<boolean>(false);
	const isBusy = busy || attaching;

	useEffect(() => {
		if (selectedRoleId !== undefined) {
			setActiveRole(selectedRoleId ?? null);
		}
	}, [selectedRoleId]);

	useEffect(() => {
		setAttachValue("");
	}, [activeRole]);

	const selectedRole = useMemo(() => roles.find((role) => role.id === activeRole) ?? null, [roles, activeRole]);

	const availablePermissions = useMemo(() => {
		if (!selectedRole) {
			return permissions;
		}
		const assigned = new Set(selectedRole.permissions.map((perm) => perm.id));
		return permissions.filter((perm) => !assigned.has(perm.id));
	}, [permissions, selectedRole]);

	const handleSelect = (roleId: string) => {
		setActiveRole(roleId);
		onSelectRole?.(roleId);
	};

	const handleAttach = async (event: React.ChangeEvent<HTMLSelectElement>) => {
		const permissionId = event.target.value;
		setAttachValue(permissionId);
		if (!selectedRole || !permissionId) {
			setAttachValue("");
			return;
		}
		try {
			setAttaching(true);
			await onAttachPermission?.(selectedRole.id, permissionId);
		} finally {
			setAttachValue("");
			setAttaching(false);
		}
	};

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			<section className="rounded border border-slate-200 bg-white shadow-sm">
				<header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Roles</h2>
					<span className="text-xs text-slate-500">{roles.length} total</span>
				</header>
				{roles.length === 0 ? (
					<p className="px-4 py-6 text-sm text-slate-500">No roles defined yet.</p>
				) : (
					<table className="min-w-full divide-y divide-slate-200 text-sm">
						<tbody className="divide-y divide-slate-200">
							{roles.map((role) => {
								const isSelected = role.id === selectedRole?.id;
								return (
									<tr
										key={role.id}
										className={isSelected ? "cursor-pointer bg-amber-50" : "cursor-pointer hover:bg-slate-50"}
										onClick={() => handleSelect(role.id)}
									>
										<td className="px-4 py-3 font-medium text-slate-800">{role.name}</td>
										<td className="px-4 py-3 text-xs text-slate-500">{role.description || "—"}</td>
										<td className="px-4 py-3 text-right text-xs text-slate-500">
											{role.permissions.length} perms
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</section>
			<section className="rounded border border-slate-200 bg-white shadow-sm">
				<header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Permissions</h2>
					{selectedRole ? <span className="text-xs text-slate-500">{selectedRole.name}</span> : null}
				</header>
				{!selectedRole ? (
					<p className="px-4 py-6 text-sm text-slate-500">Select a role to inspect its permissions.</p>
				) : (
					<div className="space-y-4 p-4">
						<div className="flex items-center justify-between gap-2">
							<p className="text-sm text-slate-600">Assign new permission</p>
							<select
								className="rounded border border-slate-300 px-2 py-1 text-sm"
								onChange={handleAttach}
								disabled={isBusy || availablePermissions.length === 0}
								aria-label="Assign permission"
								value={attachValue}
							>
								<option value="" disabled>
									{availablePermissions.length === 0 ? "No permissions available" : "Select permission"}
								</option>
								{availablePermissions.map((perm) => (
									<option key={perm.id} value={perm.id}>
										{perm.action}
									</option>
								))}
							</select>
						</div>
						<ul className="space-y-2">
							{selectedRole.permissions.length === 0 ? (
								<li className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
									No permissions assigned yet.
								</li>
							) : (
								selectedRole.permissions.map((perm) => (
									<li
										key={perm.id}
										className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2"
									>
										<div>
											<p className="text-sm font-medium text-slate-700">{perm.action}</p>
											<p className="text-xs text-slate-500">{perm.description || "—"}</p>
										</div>
										{onDetachPermission ? (
											<button
												type="button"
												className="rounded bg-rose-100 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-200 disabled:opacity-50"
												onClick={() => void onDetachPermission(selectedRole.id, perm.id)}
												disabled={isBusy}
											>
												Remove
											</button>
										) : null}
									</li>
								))
							)}
						</ul>
					</div>
				)}
			</section>
		</div>
	);
}
