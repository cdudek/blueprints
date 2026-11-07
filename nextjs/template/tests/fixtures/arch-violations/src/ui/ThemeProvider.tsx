"use client";
import { createContext, type ReactNode } from "react";
const Theme = createContext("light");
export const ThemeProvider = (props: { children: ReactNode }) => (
  <Theme.Provider value="light">{props.children}</Theme.Provider>
);
