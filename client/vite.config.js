import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [
    basicSsl(), 
    react()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true,
      },
    },
  },
});
