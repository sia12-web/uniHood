import Image from "next/image";
import Link from "next/link";

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
  logoWidth = 56,
  logoHeight = 56,
}: BrandLogoProps) {
  const baseClasses = "inline-flex items-center gap-3 text-navy";
  const mergedClasses = className ? `${baseClasses} ${className}` : baseClasses;
  const baseLogoClasses = "h-14 w-auto";
  const mergedLogoClasses = logoClassName ? `${baseLogoClasses} ${logoClassName}` : baseLogoClasses;

  return (
    <Link href="/" className={mergedClasses}>
      <Image
        src="/brand/realLogo-divan.jpg"
        alt="Divan logo"
        width={logoWidth}
        height={logoHeight}
        priority
        className={mergedLogoClasses}
      />
      {withWordmark ? <span className="text-lg font-semibold tracking-tight">Divan</span> : null}
    </Link>
  );
}
