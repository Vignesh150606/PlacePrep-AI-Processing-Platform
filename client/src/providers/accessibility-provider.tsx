import * as React from "react";
import {
  AccessibilityContext,
  REDUCED_MOTION_STORAGE_KEY,
  FONT_SIZE_STORAGE_KEY,
  applyReducedMotionClass,
  applyFontSizeAttr,
  type FontSize,
} from "./accessibility-context";

/**
 * NEW (Phase 16): backs Settings > Appearance's "reduced motion" and "font
 * size" controls. Client-only and localStorage-persisted, the same shape
 * theme-provider.tsx already established for exactly this kind of
 * "applies on next paint, the backend never needs to know" preference --
 * not a second state system, the same one with two more values in it.
 */
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [reducedMotion, setReducedMotionState] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(REDUCED_MOTION_STORAGE_KEY) === "1";
  });

  const [fontSize, setFontSizeState] = React.useState<FontSize>(() => {
    if (typeof window === "undefined") return "md";
    return (localStorage.getItem(FONT_SIZE_STORAGE_KEY) as FontSize | null) ?? "md";
  });

  React.useEffect(() => {
    applyReducedMotionClass(reducedMotion);
  }, [reducedMotion]);

  React.useEffect(() => {
    applyFontSizeAttr(fontSize);
  }, [fontSize]);

  const setReducedMotion = React.useCallback((value: boolean) => {
    localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, value ? "1" : "0");
    setReducedMotionState(value);
  }, []);

  const setFontSize = React.useCallback((value: FontSize) => {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, value);
    setFontSizeState(value);
  }, []);

  const value = React.useMemo(
    () => ({ reducedMotion, setReducedMotion, fontSize, setFontSize }),
    [reducedMotion, setReducedMotion, fontSize, setFontSize],
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}
