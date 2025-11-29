import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  withWordmark?: boolean;
  className?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  wordmarkTitleClassName?: string;
  taglineClassName?: string;
  tagline?: string;
  /**
   * Indicates whether the surrounding surface is light or dark so that we can
   * pick shadows/overlays that keep the logo visible.
   */
  backgroundTone?: "light" | "dark" | "transparent";
  logoWidth?: number;
  logoHeight?: number;
};

export default function BrandLogo({
  withWordmark = false,
  className,
  logoClassName,
  wordmarkClassName,
  wordmarkTitleClassName,
  taglineClassName,
  tagline = "Campus discovery",
  backgroundTone = "light",
  logoWidth = 96,
  logoHeight = 96,
}: BrandLogoProps) {
  const baseClasses = "inline-flex max-w-full flex-wrap items-center gap-3 text-[#1b2a3a]";
  const mergedClasses = cn(baseClasses, className);
  const mergedLogoClasses = cn(
    "h-16 w-auto max-w-full shrink-0 object-contain transition-transform duration-200 group-hover:scale-[1.02]",
    logoClassName,
  );
  
  let emblemBackdropClasses = "";
  if (backgroundTone === "dark") {
    emblemBackdropClasses = "bg-white/15 shadow-[0_15px_35px_rgba(0,0,0,0.65)]";
  } else if (backgroundTone === "light") {
    emblemBackdropClasses = "bg-white shadow-[0_20px_40px_rgba(15,23,42,0.18)]";
  } else {
    // transparent
    emblemBackdropClasses = "";
  }

  return (
    <Link href="/" className={mergedClasses} aria-label="Divan home">
      <span
        className={cn(
          "group flex shrink-0 items-center justify-center rounded-2xl p-2 transition-shadow duration-200",
          emblemBackdropClasses,
        )}
      >
        <Image
          src="/brand/logo.png"
          alt="Divan"
          width={logoWidth}
          height={logoHeight}
          className={mergedLogoClasses}
          priority
          unoptimized
        />
      </span>

      {withWordmark ? (
        <span className={cn("flex min-w-0 flex-col leading-none text-current", wordmarkClassName)}>
          <span className={cn("text-2xl font-black tracking-tight", wordmarkTitleClassName)}>Divan</span>
          <span
            className={cn(
              "text-[0.65rem] font-semibold uppercase tracking-[0.4em] opacity-70",
              taglineClassName,
            )}
          >
            {tagline}
          </span>
        </span>
      ) : null}
    </Link>
  );
}
