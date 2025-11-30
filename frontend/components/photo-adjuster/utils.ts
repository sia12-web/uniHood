import { Point, Size } from "./types";

/**
 * Calculates the transform (scale and offset) to cover the frame with the image,
 * similar to CSS object-fit: cover.
 */
export function getCoverTransform(
    imgSize: Size,
    frameSize: Size,
    zoom: number,
    offset: Point
): { scale: number; x: number; y: number } {
    const imageRatio = imgSize.width / imgSize.height;
    const frameRatio = frameSize.width / frameSize.height;

    let baseScale = 1;
    if (imageRatio > frameRatio) {
        // Image is wider than frame -> fit height
        baseScale = frameSize.height / imgSize.height;
    } else {
        // Image is taller than frame -> fit width
        baseScale = frameSize.width / imgSize.width;
    }

    const scale = baseScale * zoom;

    // Center the image by default
    const centerX = (frameSize.width - imgSize.width * scale) / 2;
    const centerY = (frameSize.height - imgSize.height * scale) / 2;

    return {
        scale,
        x: centerX + offset.x,
        y: centerY + offset.y,
    };
}

/**
 * Constrains the drag offset so the image always covers the frame.
 */
export function constrainOffset(
    imgSize: Size,
    frameSize: Size,
    zoom: number,
    currentOffset: Point
): Point {
    const { scale } = getCoverTransform(imgSize, frameSize, zoom, { x: 0, y: 0 });

    // Calculate the dimensions of the scaled image
    const scaledW = imgSize.width * scale;
    const scaledH = imgSize.height * scale;

    // Calculate the maximum allowed offset in each direction
    // The image is centered by default, so we calculate how much "extra" image there is
    const maxX = Math.max(0, (scaledW - frameSize.width) / 2);
    const maxY = Math.max(0, (scaledH - frameSize.height) / 2);

    return {
        x: Math.max(-maxX, Math.min(maxX, currentOffset.x)),
        y: Math.max(-maxY, Math.min(maxY, currentOffset.y)),
    };
}

/**
 * Draws the cropped image to a canvas and returns a Blob.
 */
export async function getCroppedImage(
    image: HTMLImageElement,
    crop: { zoom: number; offset: Point },
    aspectRatio: number, // width / height
    maxOutputSize: number,
    outputType: string,
    quality: number
): Promise<Blob> {
    const canvas = document.createElement("canvas");

    // Determine output dimensions
    // We want the output to be as large as possible up to maxOutputSize
    // while maintaining the aspect ratio.
    let width = maxOutputSize;
    let height = maxOutputSize;

    if (aspectRatio > 1) {
        height = width / aspectRatio;
    } else {
        width = height * aspectRatio;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    // Use high quality smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Calculate the source rectangle to draw from the original image
    // We need to map the "frame" (canvas) back to the image coordinates.

    // 1. Calculate how the image is currently displayed relative to the "frame"
    // We simulate a frame of size [width, height]
    const { scale, x, y } = getCoverTransform(
        { width: image.naturalWidth, height: image.naturalHeight },
        { width, height },
        crop.zoom,
        crop.offset
    );

    // 2. Draw the image with the calculated transform
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Canvas to Blob failed"));
            },
            outputType,
            quality
        );
    });
}

export function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
