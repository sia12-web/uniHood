import { api } from "./api";

export type MeetupStatus = "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
export type MeetupRole = "HOST" | "PARTICIPANT";
export type MeetupCategory = "study" | "social" | "game" | "food" | "other";
export type MeetupParticipantStatus = "JOINED" | "LEFT";

export interface MeetupParticipant {
  user_id: string;
  role: MeetupRole;
  status: MeetupParticipantStatus;
  joined_at: string;
  left_at?: string;
}

export interface MeetupResponse {
  id: string;
  creator_user_id: string;
  campus_id: string;
  title: string;
  description?: string;
  category: MeetupCategory;
  start_at: string;
  duration_min: number;
  status: MeetupStatus;
  room_id?: string;
  cancel_reason?: string;
  created_at: string;
  updated_at: string;
  participants_count: number;
  is_joined: boolean;
  my_role?: MeetupRole;
}

export interface MeetupDetailResponse extends MeetupResponse {
  participants: MeetupParticipant[];
}

export interface MeetupCreateRequest {
  title: string;
  description?: string;
  category: MeetupCategory;
  start_at: string; // ISO string
  duration_min: number;
  campus_id?: string;
}

export async function listMeetups(campusId?: string, category?: MeetupCategory): Promise<MeetupResponse[]> {
  const params = new URLSearchParams();
  if (campusId) params.set("campus_id", campusId);
  if (category) params.set("category", category);
  const response = await api.get(`/meetups/?${params.toString()}`);
  return response.data;
}

export async function createMeetup(data: MeetupCreateRequest): Promise<MeetupResponse> {
  const response = await api.post("/meetups/", data);
  return response.data;
}

export async function getMeetup(id: string): Promise<MeetupDetailResponse> {
  const response = await api.get(`/meetups/${id}`);
  return response.data;
}

export async function joinMeetup(id: string): Promise<void> {
  await api.post(`/meetups/${id}/join`);
}

export async function leaveMeetup(id: string): Promise<void> {
  await api.post(`/meetups/${id}/leave`);
}

export async function cancelMeetup(id: string, reason: string): Promise<void> {
  const params = new URLSearchParams({ reason });
  await api.post(`/meetups/${id}/cancel?${params.toString()}`);
}
