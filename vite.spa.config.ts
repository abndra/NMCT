import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname);

/** Static SPA build (Netlify-ready, emits an index.html) */
export default defineConfig({
  plugins: [
    {
      name: "spa-root-route",
      enforce: "pre",
      resolveId(source, importer) {
        if (!importer) return null;
        const resolved = path.resolve(path.dirname(importer), source);
        if (
          resolved === path.join(rootDir, "src/routes/__root.tsx") ||
          resolved === path.join(rootDir, "src/routes/__root")
        ) {
          return path.join(rootDir, "spa/root.spa.tsx");
        }
        return null;
      },
    },
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    react(),
  ],
  resolve: { alias: { "@": path.join(rootDir, "src") } },
  build: {
    outDir: "dist-static",
    emptyOutDir: true,
    rollupOptions: { input: path.join(rootDir, "spa/index.html") },
  },
});