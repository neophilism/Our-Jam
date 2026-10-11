import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: {
    host: "0.0.0.0",
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
});
