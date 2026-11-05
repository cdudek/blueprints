import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" };

export function Button({ variant = "primary", className, ...rest }: Props) {
  return (
    <button
      {...rest}
      data-variant={variant}
      className={className ? `ui-button ${className}` : "ui-button"}
    />
  );
}
