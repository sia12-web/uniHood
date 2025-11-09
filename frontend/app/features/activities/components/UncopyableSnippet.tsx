import React, { useEffect, useRef, useState } from 'react';

type Props = {
  text: string;
  widthPx?: number;   // canvas content width
  font?: string;      // CSS font string
  lineHeight?: number;// px
  padding?: number;   // px
  antiOcrNoise?: boolean; // optional micro-noise background
};

/**
 * Renders text to a <canvas> so it can't be selected or copied.
 * Accessibility: exposes the exact text via aria-label (screen readers can read it).
 * If you want even stronger OCR resistance, set antiOcrNoise.
 */
export const UncopyableSnippet: React.FC<Props> = ({
  text,
  widthPx = 560,
  font = '14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  lineHeight = 20,
  padding = 12,
  antiOcrNoise = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Prepare wrapping
    ctx.font = font;
    const maxLineWidth = widthPx - padding * 2;

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxLineWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);

    // Compute canvas size
    const contentWidth = widthPx;
    const contentHeight = padding * 2 + lines.length * lineHeight;

    canvas.width = Math.ceil(contentWidth * dpr);
    canvas.height = Math.ceil(contentHeight * dpr);
    canvas.style.width = `${contentWidth}px`;
    canvas.style.height = `${contentHeight}px`;

    // Draw
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Background
    ctx.fillStyle = '#F9FAFB'; // gray-50
    ctx.fillRect(0, 0, contentWidth, contentHeight);

    // Optional micro-noise to make OCR a bit harder (light)
    if (antiOcrNoise) {
      const noiseDensity = 0.05; // 5% pixels (very light)
      const noiseCount = Math.floor(contentWidth * contentHeight * noiseDensity * 0.002);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#e5e7eb';
      for (let i = 0; i < noiseCount; i++) {
        const x = Math.random() * contentWidth;
        const y = Math.random() * contentHeight;
        const r = Math.random() * 0.8 + 0.2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    // Border
    ctx.strokeStyle = '#E5E7EB'; // gray-200
    ctx.strokeRect(0.5, 0.5, contentWidth - 1, contentHeight - 1);

    // Text
    ctx.font = font;
    ctx.fillStyle = '#111827'; // gray-900
    let y = padding + lineHeight * 0.8; // baseline tweak
    for (const ln of lines) {
      ctx.fillText(ln, padding, y);
      y += lineHeight;
    }

    // Convert to image while keeping the canvas hidden for future updates
    setImgUrl(canvas.toDataURL('image/png'));
  }, [text, widthPx, font, lineHeight, padding, antiOcrNoise]);

  const block = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="mb-2 rounded border border-gray-200 select-none"
      onCopy={block}
      onCut={block}
      onContextMenu={block}
      onDragStart={block}
      onMouseDown={(e) => e.preventDefault()}
      draggable={false}
      role="img"
      aria-hidden="true"
      title="Copying disabled"
    >
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      {imgUrl && (
        <img
          src={imgUrl}
          alt="Uncopyable prompt"
          className="block pointer-events-none select-none"
          width={widthPx}
          draggable={false}
        />
      )}
    </div>
  );
};
