import { api } from "./api";

export interface Campus {
    id: string;
    name: string;
    domain?: string;
    logo_url?: string;
}

export const campusesApi = {
    listCampuses: async (): Promise<Campus[]> => {
        const response = await api.get<Campus[]>("/campuses/");
        return response.data;
    }
};
