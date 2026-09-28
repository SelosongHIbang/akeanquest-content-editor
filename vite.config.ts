import fs from "node:fs";
import path from "node:path";
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "akeanquest-content-autosave",
      configureServer(server) {
        server.middlewares.use("/__akeanquest/save", (req, res, next) => {
          if (req.method !== "POST") {
            next();
            return;
          }

          const requestedFile = req.url?.replace(/^\//, "") ?? "";
          const allowedFiles = new Set([
            "chapter1.json",
            "chapter2.json",
            "chapter3.json",
            "chapter4.json",
            "chapter5.json",
            "chapter6.json",
            "word_bank.json",
          ]);

          if (!allowedFiles.has(requestedFile)) {
            res.statusCode = 404;
            res.end("Unknown content file");
            return;
          }

          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          req.on("end", () => {
            try {
              const raw = Buffer.concat(chunks).toString("utf8");
              const parsed = JSON.parse(raw);
              const filePath = path.resolve(process.cwd(), "src", "data", requestedFile);
              fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch (error) {
              res.statusCode = 400;
              res.end(error instanceof Error ? error.message : "Invalid JSON");
            }
          });
        });
      },
    },
  ],
})
