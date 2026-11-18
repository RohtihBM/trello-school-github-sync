import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Found directly, not assumed: the local network's own DNS resolver was
// refusing (not timing out — an explicit REFUSED) to resolve the Neon
// hostname specifically, while every other domain and both Google's and
// Cloudflare's public resolvers answered it instantly. Overriding Node's
// resolver here, before any Prisma connection is attempted, means every
// app that imports @repo/db (Backend, Worker, Websockets) is protected
// from this exact failure mode regardless of what the local router's
// resolver does — not a fix for the router, a way to stop depending on it.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

export * from "./generated/prisma/client.js";
import { PrismaClient } from "./generated/prisma/client.js";

export const prisma = new PrismaClient();

export * from "./crashGuard.js";
export * from "./githubRepo.js";
