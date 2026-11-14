"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({
  width = 293,
  height = 83,
  className,
  priority = false,
}: {
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <>
      <Image
        src="/brand/tawper-logo.png"
        alt="Tawper"
        width={width}
        height={height}
        className={cn("dark:hidden", className)}
        priority={priority}
      />
      <Image
        src="/brand/tawper-logo-white.png"
        alt="Tawper"
        width={width}
        height={height}
        className={cn("hidden dark:block", className)}
        priority={priority}
      />
    </>
  );
}
