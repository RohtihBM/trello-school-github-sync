# Deploying on AWS with Docker

One EC2 server (t3.small, 2 GB, Mumbai) runs the Backend, Websockets and Worker
as containers, with Caddy in front for HTTPS. Vercel (Frontend), Upstash (Redis)
and Neon (Postgres) stay hosted. Estimated cost: about $22/month (roughly
₹2,000), covered by new-account credits where they apply.

## Why this exists
Render's free 512 MB cannot hold the embedding model, so the deployed Worker ran
keyword retrieval. A 2 GB server lets the Worker run the same hybrid pipeline
(chunk, embed, pgvector search, fusion) as local.

## Steps
1. Create an AWS account; set a billing alert at a low amount first.
2. Launch an EC2 t3.small (Ubuntu 24.04, 20 GB disk) in ap-south-1. Open ports
   22, 80 and 443 in its security group.
3. Install Docker on it and clone this repository.
4. Copy `deploy/.env.example` to `deploy/.env` and fill in the values. For
   `API_HOST` and `WS_HOST` use sslip.io names built from the server's public IP
   (e.g. `api.203-0-113-7.sslip.io`).
5. `docker compose up -d --build`, then check `docker compose ps` and
   `docker stats` (the Worker should stay well under 2 GB).
6. In Vercel set `VITE_API_URL=https://<API_HOST>` and
   `VITE_WS_URL=wss://<WS_HOST>`, then redeploy the Frontend.
7. Stop or terminate the server when not needed; a stopped instance bills only
   for its disk.
