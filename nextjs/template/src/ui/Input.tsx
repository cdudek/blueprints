import type { InputHTMLAttributes } from "react";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={className ? `ui-input ${className}` : "ui-input"} />;
}
