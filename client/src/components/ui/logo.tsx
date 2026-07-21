import { cn } from "@/lib/utils";

/**
 * NEW (Phase 16): the real PlacePrep logo mark, replacing the generic
 * `GraduationCap` icon-in-a-box placeholder that stood in for it in the
 * sidebar, mobile nav, and login page. `/logo.png` is the icon glyph cropped
 * out of the source artwork (the full lockup also has a "PlacePrep" wordmark
 * and tagline baked in, which would be redundant next to the text heading
 * every call site already renders beside it).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="PlacePrep logo"
      className={cn("size-7 rounded-md object-contain", className)}
    />
  );
}
