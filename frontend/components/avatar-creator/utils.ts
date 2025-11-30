import { AvatarState } from "./types";
import { ASSETS, BACKGROUNDS } from "./assets";

export function getRandomAvatar(): AvatarState {
    const getRandom = (category: string): string | undefined => {
        const items = ASSETS.filter((a) => a.category === category);
        if (items.length === 0) return undefined;
        return items[Math.floor(Math.random() * items.length)].id;
    };

    const getRandomBg = () => {
        return BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)].id;
    };

    return {
        background: getRandomBg(),
        body: getRandom("body") || "body-light",
        eyes: getRandom("eyes") || "eyes-normal",
        mouth: getRandom("mouth") || "mouth-smile",
        top: Math.random() > 0.2 ? getRandom("top") : undefined,
        bottom: Math.random() > 0.2 ? getRandom("bottom") : undefined,
        accessories: Math.random() > 0.5 ? getRandom("accessories") : undefined,
    };
}

export async function exportAvatarToBlob(
    svgElement: SVGSVGElement,
    width = 400,
    height = 400
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
        }

        const data = new XMLSerializer().serializeToString(svgElement);
        const img = new Image();
        const svgBlob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Canvas to Blob failed"));
            }, "image/png");
        };
        img.onerror = reject;
        img.src = url;
    });
}
