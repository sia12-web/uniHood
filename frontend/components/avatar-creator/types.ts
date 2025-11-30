export type AvatarCategory = "body" | "eyes" | "mouth" | "top" | "bottom" | "shoes" | "accessories";



export interface AvatarState {
    background: string;
    body: string; // ID of the body item
    eyes: string;
    mouth: string;
    top?: string;
    bottom?: string;
    shoes?: string;
    accessories?: string;
}

export interface AvatarCreatorProps {
    onSave: (blob: Blob, state: AvatarState) => void;
    onCancel: () => void;
    initialState?: Partial<AvatarState>;
    className?: string;
}
