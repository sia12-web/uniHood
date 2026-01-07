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
        return api.post("/clubs/", data);
    },

    listClubs: async (campusId?: string): Promise<Club[]> => {
        return api.get("/clubs/", { params: { campus_id: campusId } });
    },

    getClub: async (id: string): Promise<ClubDetail> => {
        return api.get(`/clubs/${id}`);
    },

    joinClub: async (id: string): Promise<{ ok: boolean }> => {
        return api.post(`/clubs/${id}/join`);
    },

    leaveClub: async (id: string): Promise<{ ok: boolean }> => {
        return api.delete(`/clubs/${id}/join`);
    },

    getClubMeetups: async (clubId: string): Promise<ClubMeetup[]> => {
        return api.get("/meetups/", { params: { club_id: clubId } });
    }
};
