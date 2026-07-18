import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// NEW (Phase 14, Part 1 -- Mobile Experience & PWA): from-scratch PWA
// infrastructure. Confirmed via repo audit that none existed before this
// pass (no manifest, no service worker, no install prompt).
//
// `injectManifest` (not the zero-config `generateSW`) is used deliberately:
// this pass needs a real BackgroundSyncPlugin registration and a genuine
// two-tier offline fallback (cached app shell first, a dedicated static
// page only if even that isn't cached), and generateSW's declarative
// config can't express either. The hand-written service worker lives at
// `src/sw.ts` -- see its own header comment for the caching/sync strategy.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // offline.html + the icon set aren't reachable from index.html's
        // own import graph, so the default glob-based manifest scan won't
        // pick them up -- list them explicitly so they're precached too.
        globPatterns: ["**/*.{js,css,html,woff2,svg,png,ico}"],
      },
      registerType: "prompt",
      // Registration is driven from React (`use-pwa-update.ts`, via
      // `virtual:pwa-register/react`) so the update prompt can be a real
      // in-app toast instead of a bare `confirm()`; the auto-injected
      // register script would double-register the same worker.
      injectRegister: null,
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "offline.html"],
      manifest: {
        name: "PlacePrep — Placement Intelligence Platform",
        short_name: "PlacePrep",
        description:
          "AI-assisted placement preparation: question bank, quizzes, company intelligence, interview experiences, and community, in one place.",
        theme_color: "#6e56cf",
        background_color: "#0f0f14",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // NEW (Phase 14, Part 1 -- Performance): separate the heaviest
        // rarely-changing vendor code from app code so a deploy that only
        // touches app logic doesn't bust the cache for React/recharts/
        // framer-motion, and so the initial route's JS payload is smaller.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("/react-dom/") || id.includes("/react/")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
});
