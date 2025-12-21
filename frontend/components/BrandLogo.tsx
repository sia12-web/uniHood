import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  // withWordmark removed
  className?: string;
  logoClassName?: string;
  // wordmarkClassName removed
  // wordmarkTitleClassName removed
  // taglineClassName removed
  // tagline removed
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
  disableMixBlend?: boolean;
};

export default function BrandLogo({
  // withWordmark removed
  className,
  logoClassName,
  // wordmarkClassName removed
  // wordmarkTitleClassName removed
  // taglineClassName removed
  // tagline removed
  backgroundTone = "light",
  logoWidth = 140,
  logoHeight = 140,
  asLink = true,
  disableMixBlend = false,
}: BrandLogoProps) {
  const baseClasses = "inline-flex max-w-full flex-wrap items-center gap-3 text-[#1b2a3a]";
  const mergedClasses = cn(baseClasses, className);
  const mergedLogoClasses = cn(
    "h-10 w-auto max-w-full shrink-0 object-contain transition-transform duration-200 sm:h-12",
    !disableMixBlend && "mix-blend-multiply",
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
          src="/unihood-logo.png"
          alt="uniHood"
          width={logoWidth}
          height={logoHeight}
          className={mergedLogoClasses}
          priority
          unoptimized
        />
      </span>


    </>
  );

  if (asLink) {
    return (
      <Link href="/" className={mergedClasses} aria-label="uniHood home">
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
