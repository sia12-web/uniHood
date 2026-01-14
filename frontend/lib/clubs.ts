import { api } from "./api";


export interface Club {
    id: string;
    name: string;
    description?: string;
    owner_id: string;
    campus_id?: string;
    created_at: string;
    member_count: number;
}

export interface ClubDetail extends Club {
    members?: unknown[];
}

export interface ClubCreateRequest {
    name: string;
    description?: string;
    campus_id?: string;
}

export interface ClubMeetup {
    id: string;
    title: string;
    start_at: string;
    description?: string;
    [key: string]: unknown;
}

export const clubsApi = {
    createClub: async (data: ClubCreateRequest): Promise<Club> => {
        const response = await api.post<Club>("/clubs/", data);
        return response.data;
    },

    listClubs: async (campusId?: string): Promise<Club[]> => {
        const response = await api.get<Club[]>("/clubs/", { params: { campus_id: campusId } });
        return response.data;
    },

    getClub: async (id: string): Promise<ClubDetail> => {
        const response = await api.get<ClubDetail>(`/clubs/${id}`);
        return response.data;
    },

    joinClub: async (id: string): Promise<{ ok: boolean }> => {
        const response = await api.post<{ ok: boolean }>(`/clubs/${id}/join`);
        return response.data;
    },

    leaveClub: async (id: string): Promise<{ ok: boolean }> => {
        const response = await api.delete<{ ok: boolean }>(`/clubs/${id}/join`);
        return response.data;
    },

    getClubMeetups: async (clubId: string): Promise<ClubMeetup[]> => {
        const response = await api.get<ClubMeetup[]>("/meetups/", { params: { club_id: clubId } });
        return response.data;
    }
};
