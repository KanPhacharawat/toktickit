import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.tsx"],
    // A screen a test forgets to mock must fail loudly and locally (a
    // rejected fetch caught by the app's own error handling), never
    // silently succeed or fail against whatever happens to be listening on
    // localhost:3000 (a dev server left running from other work). Real
    // dev/build still default to localhost:3000 in src/api.ts.
    env: { VITE_API_URL: "http://127.0.0.1:1" },
  },
});
