import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  withWordmark?: boolean;
  className?: string;
};

export default function BrandLogo({ withWordmark = false, className }: BrandLogoProps) {
  const baseClasses = "flex items-center gap-3 text-navy";
  const mergedClasses = className ? `${baseClasses} ${className}` : baseClasses;

  return (
    <Link href="/" className={mergedClasses}>
      <Image
        src="/brand/divan-logo.jpg"
        alt="Divan logo"
        width={56}
        height={72}
        priority
        className="h-14 w-auto"
      />
      {withWordmark ? <span className="text-lg font-semibold tracking-tight">Divan</span> : null}
    </Link>
  );
}
