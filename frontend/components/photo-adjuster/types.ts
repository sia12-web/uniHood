export type AspectRatio = "square" | "portrait"; // 1:1 or 4:5

export type OutputType = "image/png" | "image/jpeg";

export interface Point {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface PhotoAdjusterProps {
    /**
     * Callback when the user confirms the edit.
     * Returns a Blob of the cropped image.
     */
    onConfirm: (blob: Blob) => void;

    /**
     * Callback when the user cancels the edit or clears the image.
     */
    onCancel: () => void;

    /**
     * Initial aspect ratio for the crop frame.
     * Defaults to 'square'.
     */
    aspectRatio?: AspectRatio;

    /**
     * Maximum width/height of the output image in pixels.
     * Defaults to 1080.
     */
    maxOutputSize?: number;

    /**
     * Output image format.
     * Defaults to 'image/jpeg'.
     */
    outputType?: OutputType;

    /**
     * Quality of the output image (0 to 1).
     * Only applies to 'image/jpeg'. Defaults to 0.92.
     */
    quality?: number;

    /**
     * Optional class name for the container.
     */
    className?: string;
}

export interface CropState {
    zoom: number;
    offset: Point;
}
