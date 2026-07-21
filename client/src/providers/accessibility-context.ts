import * as React from "react";

export type FontSize = "sm" | "md" | "lg";

export interface AccessibilityContextValue {
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  fontSize: FontSize;
  setFontSize: (value: FontSize) => void;
}

export const AccessibilityContext = React.createContext<AccessibilityContextValue | null>(null);

export const REDUCED_MOTION_STORAGE_KEY = "placeprep-reduced-motion";
export const FONT_SIZE_STORAGE_KEY = "placeprep-font-size";

export function applyReducedMotionClass(enabled: boolean) {
  document.documentElement.classList.toggle("reduce-motion", enabled);
}

export function applyFontSizeAttr(size: FontSize) {
  if (size === "md") {
    document.documentElement.removeAttribute("data-font-size");
  } else {
    document.documentElement.setAttribute("data-font-size", size);
  }
}
