import { api } from "./api";

export interface Campus {
    id: string;
    name: string;
    domain?: string;
    logo_url?: string;
}

export const campusesApi = {
    listCampuses: async (): Promise<Campus[]> => {
        return api.get("/campuses/");
    }
};
