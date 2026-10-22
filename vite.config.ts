import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["exceljs"] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "microsoft-auth": ["@azure/msal-browser"],
          query: ["@tanstack/react-query"],
          validation: ["zod"],
          motion: ["framer-motion"],
          overlays: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "cmdk",
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
