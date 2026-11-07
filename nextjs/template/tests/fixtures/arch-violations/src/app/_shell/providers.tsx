"use client";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/ui/ThemeProvider";
export const Providers = (props: { children: ReactNode }) => <ThemeProvider>{props.children}</ThemeProvider>;
