import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API = `http://localhost:${process.env.COURT_PORT ?? 4310}`;

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 5180,
        strictPort: true,
        proxy: {
            "/api": API,
            "/socket.io": { target: API, ws: true },
        },
    },
});
