import * as React from "react";
import { ThemeContext } from "@/providers/theme-context";

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
