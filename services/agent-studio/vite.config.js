import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host = env.VITE_DEV_HOST || "127.0.0.1";
  const apiTarget = env.VITE_API_PROXY_TARGET
    || `http://${env.BFF_HOST || "127.0.0.1"}:${env.PORT || env.BFF_PORT || 48787}`;

  return {
    plugins: [react()],
    server: {
      host,
      port: Number(env.FRONTEND_PORT || 45173),
      strictPort: true,
      proxy: {
        "/api": apiTarget,
        "/exports": apiTarget
      }
    }
  };
});
