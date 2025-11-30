import { forwardRef } from "react";
import { AvatarState } from "./types";
import { getAsset, BACKGROUNDS } from "./assets";

interface AvatarCanvasProps {
    state: AvatarState;
    className?: string;
}

const AvatarCanvas = forwardRef<SVGSVGElement, AvatarCanvasProps>(({ state, className }, ref) => {
    const bgColor = BACKGROUNDS.find((b) => b.id === state.background)?.color || "#ffffff";

    // Order matters for z-index
    const layers = [
        state.body,
        state.eyes,
        state.mouth,
        state.bottom, // Pants go under shirt usually, or over? Let's say under for now.
        state.top,
        state.shoes,
        state.accessories,
    ]
        .map((id) => (id ? getAsset(id) : null))
        .filter(Boolean);

    return (
        <svg
            ref={ref}
            viewBox="0 0 200 200"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ backgroundColor: bgColor }}
        >
            {layers.map((layer) => (
                <g key={(layer as { id: string }).id} dangerouslySetInnerHTML={{ __html: (layer as { svg: string }).svg }} />
            ))}
        </svg>
    );
});

AvatarCanvas.displayName = "AvatarCanvas";

export default AvatarCanvas;
