import Link from "next/link";
import Image from "next/image";

type BrandLogoProps = {
  withWordmark?: boolean;
  className?: string;
  logoClassName?: string;
  logoWidth?: number;
  logoHeight?: number;
};

export default function BrandLogo({
  withWordmark = false,
  className,
  logoClassName,
  logoWidth = 96,
  logoHeight = 96,
}: BrandLogoProps) {
  const baseClasses = "inline-flex items-center gap-4 text-[#1b2a3a]";
  const mergedClasses = className ? `${baseClasses} ${className}` : baseClasses;
  const baseLogoClasses = "h-20 w-auto";
  const mergedLogoClasses = logoClassName ? logoClassName : baseLogoClasses;

  return (
    <Link href="/" className={mergedClasses} aria-label="Divan home">
      <Image
        src="/brand/logo.png"
        alt="Divan"
        width={logoWidth}
        height={logoHeight}
        className={`${mergedLogoClasses} object-contain`}
        priority
        unoptimized
      />

    </Link>
  );
}
