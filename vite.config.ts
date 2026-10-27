/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH is set in CI to "/<repo-name>/" for GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  test: { include: ["src/**/*.test.ts"] },
});
