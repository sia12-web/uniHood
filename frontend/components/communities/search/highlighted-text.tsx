"use client";

import { sanitizeHighlight } from "@/utils/search";

export type HighlightedTextProps = {
  value?: string | null;
};

export function HighlightedText({ value }: HighlightedTextProps) {
  if (!value) {
    return null;
  }
  return <span dangerouslySetInnerHTML={{ __html: sanitizeHighlight(value) }} />;
}
