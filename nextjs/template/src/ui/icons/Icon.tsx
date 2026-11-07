import type { ReactNode, SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { label?: string; children: ReactNode };

/** A label makes the icon meaningful (role="img"); without one it is decoration (aria-hidden). */
export function Icon({ label, children, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {children}
    </svg>
  );
}
