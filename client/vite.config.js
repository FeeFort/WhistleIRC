import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  publicDir: false,
  optimizeDeps: {
    include: ["@lucide/vue"],
    force: true,
  },
  server: {
    // Allow Vite connections while a VPN is active.
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      host: "localhost",
      clientPort: 5173,
      protocol: "ws",
    },
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:6000",
        changeOrigin: true,
        ws: true,
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
  build: {
    outDir: "../server/src/public",
    emptyOutDir: true,
    cssMinify: false,
  },
});
