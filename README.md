# Lightweight AI Chat WebUI

A lightweight local-first AI chat interface built with Next.js App Router. NVIDIA provider requests are proxied through backend API routes so the server-side default API key is not exposed to the browser.

## Install

```bash
npm install
```

## Run

Create `.env.local`:

```bash
NVIDIA_API_KEY=your_nvidia_api_key_here
```

For Vercel, add the same `NVIDIA_API_KEY` value in Project Settings -> Environment Variables. Do not use `NEXT_PUBLIC_*` for API keys.

```bash
npm run dev
```

For Termux/proot or remote browser access:

```bash
npm run dev -- --host 0.0.0.0
```

Then open:

```text
http://127.0.0.1:3000
```

## Build

```bash
npm run build
npm run start
```

## Example Provider Config

NVIDIA:

```text
Provider name: NVIDIA
Base URL: https://integrate.api.nvidia.com/v1
Model: nvidia/nemotron-3-super-120b-a12b
```

## Notes

- Chats and UI settings are stored in browser `localStorage`.
- The server default key is read from `NVIDIA_API_KEY` only inside `/api/models` and `/api/chat`.
- Optional custom API keys can be entered in Settings to override the server key for that browser.
- No database, authentication, or Docker setup is required.
- The model list is editable manually. On startup, the app attempts to fetch NVIDIA models through `/api/models`.
