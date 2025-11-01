"use client";

import { useCallback, useEffect, useState } from "react";

import SearchBar from "@/components/SearchBar";
import RoomResultCard from "@/components/RoomResultCard";
import UserResultCard from "@/components/UserResultCard";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { discoverPeople, discoverRooms, searchUsers } from "@/lib/search";
import type { RoomDiscoverResult, SearchUserResult } from "@/lib/types";

type TabKey = "users" | "rooms";

const MIN_QUERY_LENGTH = 2;
const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export default function SearchPage() {
	const [tab, setTab] = useState<TabKey>("users");
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [users, setUsers] = useState<SearchUserResult[]>([]);
	const [userCursor, setUserCursor] = useState<string | null>(null);
	const [usersLoading, setUsersLoading] = useState(false);
	const [people, setPeople] = useState<SearchUserResult[]>([]);
	const [peopleCursor, setPeopleCursor] = useState<string | null>(null);
	const [peopleLoading, setPeopleLoading] = useState(false);
	const [rooms, setRooms] = useState<RoomDiscoverResult[]>([]);
	const [roomCursor, setRoomCursor] = useState<string | null>(null);
	const [roomsLoading, setRoomsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const handle = setTimeout(() => setDebouncedQuery(query.trim()), 250);
		return () => clearTimeout(handle);
	}, [query]);

	const fetchUsers = useCallback(
		async (cursor: string | null, append: boolean) => {
			if (debouncedQuery.length < MIN_QUERY_LENGTH) {
				setUsers([]);
				setUserCursor(null);
				return;
			}
			setUsersLoading(true);
			try {
				const response = await searchUsers({
					query: debouncedQuery,
					cursor,
					userId: DEMO_USER_ID,
					campusId: DEMO_CAMPUS_ID,
				});
				setUsers((prev) => (append ? [...prev, ...response.items] : response.items));
				setUserCursor(response.cursor ?? null);
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to search users");
				if (!append) {
					setUsers([]);
					setUserCursor(null);
				}
			} finally {
				setUsersLoading(false);
			}
		},
		[debouncedQuery],
	);

	const loadPeople = useCallback(
		async (cursor: string | null, append: boolean) => {
			setPeopleLoading(true);
			try {
				const response = await discoverPeople({
					cursor,
					userId: DEMO_USER_ID,
					campusId: DEMO_CAMPUS_ID,
				});
				setPeople((prev) => (append ? [...prev, ...response.items] : response.items));
				setPeopleCursor(response.cursor ?? null);
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load suggestions");
				if (!append) {
					setPeople([]);
					setPeopleCursor(null);
				}
			} finally {
				setPeopleLoading(false);
			}
		},
		[],
	);

	const loadRooms = useCallback(
		async (cursor: string | null, append: boolean) => {
			setRoomsLoading(true);
			try {
				const response = await discoverRooms({
					cursor,
					userId: DEMO_USER_ID,
					campusId: DEMO_CAMPUS_ID,
				});
				setRooms((prev) => (append ? [...prev, ...response.items] : response.items));
				setRoomCursor(response.cursor ?? null);
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load rooms");
				if (!append) {
					setRooms([]);
					setRoomCursor(null);
				}
			} finally {
				setRoomsLoading(false);
			}
		},
		[],
	);

	useEffect(() => {
		void loadPeople(null, false);
	}, [loadPeople]);

	useEffect(() => {
		void loadRooms(null, false);
	}, [loadRooms]);

	useEffect(() => {
		if (tab !== "users") {
			return;
		}
		if (debouncedQuery.length >= MIN_QUERY_LENGTH) {
			void fetchUsers(null, false);
		} else if (people.length === 0 && !peopleLoading) {
			void loadPeople(null, false);
		}
	}, [tab, debouncedQuery, fetchUsers, loadPeople, people.length, peopleLoading]);

	const loadMoreUsers = useCallback(() => {
		if (!userCursor) {
			return;
		}
		void fetchUsers(userCursor, true);
	}, [fetchUsers, userCursor]);

	const loadMorePeople = useCallback(() => {
		if (!peopleCursor) {
			return;
		}
		void loadPeople(peopleCursor, true);
	}, [loadPeople, peopleCursor]);

	const loadMoreRooms = useCallback(() => {
		if (!roomCursor) {
			return;
		}
		void loadRooms(roomCursor, true);
	}, [loadRooms, roomCursor]);

	const handleSearchSubmit = useCallback(() => {
		if (tab === "users") {
			void fetchUsers(null, false);
		}
	}, [fetchUsers, tab]);

	return (
		<main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
			<header className="flex flex-col gap-2">
				<h1 className="text-2xl font-semibold text-slate-900">Search & Discovery</h1>
				<p className="text-sm text-slate-600">
					Find people by handle, browse suggested connections, and explore trending rooms on your campus.
				</p>
			</header>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={() => setTab("users")}
					className={`rounded px-4 py-2 text-sm font-medium ${tab === "users" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"}`}
				>
					Users
				</button>
				<button
					type="button"
					onClick={() => setTab("rooms")}
					className={`rounded px-4 py-2 text-sm font-medium ${tab === "rooms" ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"}`}
				>
					Rooms
				</button>
			</div>
			<SearchBar
				value={query}
				onChange={setQuery}
				onSubmit={handleSearchSubmit}
				placeholder={tab === "rooms" ? "Room discovery is curated automatically" : "Search by name or handle"}
				isSearching={tab === "users" ? usersLoading : roomsLoading}
			/>
			{error ? (
				<p className="rounded bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>
			) : null}
			{tab === "users" ? (
				<div className="space-y-4">
					{debouncedQuery.length >= MIN_QUERY_LENGTH ? (
						<>
							{usersLoading && users.length === 0 ? (
								<p className="text-sm text-slate-500">Searching users…</p>
							) : null}
							{!usersLoading && users.length === 0 ? (
								<p className="text-sm text-slate-500">No matches found for “{debouncedQuery}”.</p>
							) : null}
							<div className="space-y-3">
								{users.map((user) => (
									<UserResultCard key={user.user_id} user={user} />
								))}
							</div>
							{userCursor ? (
								<button
									type="button"
									onClick={loadMoreUsers}
									disabled={usersLoading}
									className="text-sm font-medium text-slate-700 hover:text-slate-900"
								>
									Load more results
								</button>
							) : null}
						</>
					) : (
						<>
							<p className="text-sm text-slate-500">
								Enter at least {MIN_QUERY_LENGTH} characters to search directly. Here are people you may know.
							</p>
							{peopleLoading && people.length === 0 ? (
								<p className="text-sm text-slate-500">Loading suggestions…</p>
							) : null}
							<div className="space-y-3">
								{people.map((user) => (
									<UserResultCard key={`suggest-${user.user_id}`} user={user} actionLabel="Invite" />
								))}
							</div>
							{peopleCursor ? (
								<button
									type="button"
									onClick={loadMorePeople}
									disabled={peopleLoading}
									className="text-sm font-medium text-slate-700 hover:text-slate-900"
								>
									Load more suggestions
								</button>
							) : null}
						</>
					)}
				</div>
			) : (
				<div className="space-y-4">
					<p className="text-sm text-slate-500">Trending rooms on your campus right now.</p>
					{roomsLoading && rooms.length === 0 ? (
						<p className="text-sm text-slate-500">Loading rooms…</p>
					) : null}
					{!roomsLoading && rooms.length === 0 ? (
						<p className="text-sm text-slate-500">No rooms available yet. Check back soon!</p>
					) : null}
					<div className="space-y-3">
						{rooms.map((room) => (
							<RoomResultCard key={room.room_id} room={room} />
						))}
					</div>
					{roomCursor ? (
						<button
							type="button"
							onClick={loadMoreRooms}
							disabled={roomsLoading}
							className="text-sm font-medium text-slate-700 hover:text-slate-900"
						>
							Load more rooms
						</button>
					) : null}
				</div>
			)}
		</main>
	);
}
