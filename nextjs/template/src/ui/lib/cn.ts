import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets a caller's utility win over the component's own. Server-safe. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
