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
  /**
   * Whether the logo should be a clickable link to the home page.
   * Set to false for login/onboarding pages where you want just the image.
   */
  asLink?: boolean;
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
  logoWidth = 140,
  logoHeight = 140,
  asLink = true,
}: BrandLogoProps) {
  const baseClasses = "inline-flex max-w-full flex-wrap items-center gap-3 text-[#1b2a3a]";
  const mergedClasses = cn(baseClasses, className);
  const mergedLogoClasses = cn(
    "h-20 w-auto max-w-full shrink-0 object-contain transition-transform duration-200 sm:h-24",
    asLink && "group-hover:scale-[1.02]",
    logoClassName,
  );

  let emblemBackdropClasses = "";
  if (backgroundTone === "dark") {
    emblemBackdropClasses = "";
  } else if (backgroundTone === "light") {
    emblemBackdropClasses = "";
  } else {
    // transparent
    emblemBackdropClasses = "";
  }

  const logoContent = (
    <>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center transition-shadow duration-200",
          asLink && "group",
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
    </>
  );

  if (asLink) {
    return (
      <Link href="/" className={mergedClasses} aria-label="Divan home">
        {logoContent}
      </Link>
    );
  }

  return (
    <div className={mergedClasses}>
      {logoContent}
    </div>
  );
}
