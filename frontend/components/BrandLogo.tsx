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
  logoWidth = 96,
  logoHeight = 96,
}: BrandLogoProps) {
  const baseClasses = "inline-flex items-center gap-4 text-[#1b2a3a]";
  const mergedClasses = className ? `${baseClasses} ${className}` : baseClasses;
  const baseLogoClasses = "h-20 w-auto text-[#f05656]";
  const mergedLogoClasses = logoClassName ? `${baseLogoClasses} ${logoClassName}` : baseLogoClasses;

  return (
    <Link href="/" className={mergedClasses} aria-label="Divan home">
      <svg
        viewBox="0 0 64 64"
        width={logoWidth}
        height={logoHeight}
        className={mergedLogoClasses}
        role="img"
        focusable="false"
      >
        <title>Divan</title>
        <path
          d="M18 10h12.5c11.32 0 20.5 9.18 20.5 20.5S41.82 51 30.5 51H18"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M30 20c6.9 0 12.5 5.6 12.5 12.5S36.9 45 30 45"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
        <path
          d="M18 18c0 0 3.8-8 16.8-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.35"
        />
        <path
          d="M18 46c0 0 6.5 6.5 18.5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.25"
        />
        <circle cx="17" cy="18" r="3" fill="currentColor" opacity="0.35" />
        <circle cx="45" cy="15" r="2.5" fill="currentColor" opacity="0.2" />
        <circle cx="43" cy="46" r="2" fill="currentColor" opacity="0.2" />
      </svg>
      {withWordmark ? <span className="text-3xl font-bold tracking-tight text-[#f05656]">Divan</span> : null}
    </Link>
  );
}
