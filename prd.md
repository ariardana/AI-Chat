Build a lightweight AI Chat Web UI similar to a mini Open WebUI using Next.js App Router.

Tech stack:
- Next.js latest
- TypeScript
- Tailwind CSS
- App Router
- Mobile-first responsive design
- No database
- No authentication
- No Docker
- Store all user settings and chats in browser localStorage
- Must run properly on low-resource environments like Termux/proot Android

Main goal:
Create a fast and lightweight ChatGPT-like interface that supports any OpenAI-compatible API endpoint such as:
- NVIDIA
- OpenRouter
- OpenAI
- Groq
- DeepSeek
- custom endpoints

The app must allow users to fully customize:
- API endpoint
- API key
- provider name
- model list
- active model
- temperature
- max tokens
- system prompt

========================================
DEFAULT PROVIDER CONFIGURATION
========================================

Provider:
NVIDIA

Base URL:
https://integrate.api.nvidia.com/v1

Default models:
- deepseek-ai/deepseek-v4-pro
- qwen/qwen3-coder-480b-a35b-instruct
- minimaxai/minimax-m2.7
- moonshotai/kimi-k2.6
- openai/gpt-oss-120b
- nvidia/nemotron-3-super-120b-a12b

Default selected model:
moonshotai/kimi-k2.6

Default temperature:
0.7

Default max tokens:
4096

Default system prompt:
You are a helpful AI assistant.

========================================
MODEL MANAGEMENT REQUIREMENTS
========================================

The models list must be fully editable in the Settings UI.

User must be able to:
- Add model
- Remove model
- Rename/edit model
- Select active model

Models list must be stored in localStorage.

If localStorage already contains saved models/settings:
- Use saved settings instead of defaults.

Do not hardcode models outside initialization defaults.

Model selector must appear:
- in desktop header
- in mobile drawer/menu

========================================
MAIN FEATURES
========================================

1. CHAT INTERFACE

Create a ChatGPT-like interface:
- Sidebar with chat history
- New Chat button
- Delete chat button
- Clear all chats button
- Chat messages area
- User message bubble
- Assistant message bubble
- Auto-scroll during streaming
- Loading animation while generating
- Copy assistant message button
- Markdown rendering
- Code block rendering
- Syntax highlighting optional
- Mobile responsive layout
- Dark mode default

Input behavior:
- Enter = send
- Shift+Enter = new line
- Auto-resize textarea
- Disable send button if:
  - input empty
  - API key empty
  - base URL empty
  - no selected model

2. SETTINGS MODAL

Create Settings modal accessible from top-right corner.

Settings fields:
- Provider name
- Base URL
- API Key
- Active model selector
- Editable models list
- Temperature
- Max tokens
- System prompt

Additional behavior:
- API key hidden/password input
- Save automatically to localStorage
- Restore automatically on refresh
- Warning if API key missing

3. CHAT HISTORY

Store chats in localStorage.

Chat structure:
{
  id: string,
  title: string,
  messages: Message[],
  createdAt: string,
  updatedAt: string
}

Behavior:
- Auto-create title from first user message
- Max title length 40 chars
- Sidebar lists chats
- Click to open chat
- New Chat creates empty conversation
- Delete single chat
- Clear all chats

4. STREAMING API SUPPORT

Create API route:
POST /api/chat

Frontend request body:
{
  baseUrl: string,
  apiKey: string,
  model: string,
  temperature: number,
  maxTokens: number,
  systemPrompt: string,
  messages: Array<{
    role: "system" | "user" | "assistant",
    content: string
  }>
}

API route behavior:
- Validate required fields
- Normalize baseUrl
- Call:
  {baseUrl}/chat/completions
- Use OpenAI-compatible format
- Headers:
  Authorization: Bearer {apiKey}
  Content-Type: application/json
- Request body:
  {
    model,
    messages,
    temperature,
    max_tokens,
    stream: true
  }

Must support:
- streaming response
- SSE parsing
- delta.content parsing
- AbortController
- Stop generating button
- Proper error handling
- Never log API key

5. FRONTEND STREAMING

Frontend must:
- Immediately display user message
- Create empty assistant message placeholder
- Read ReadableStream
- Parse:
  data: {...}
  data: [DONE]
- Append delta.content progressively
- Update assistant bubble in realtime
- Handle stream errors gracefully

6. MARKDOWN SUPPORT

Use:
- react-markdown
- remark-gfm

Support:
- headings
- lists
- bold
- italic
- links
- inline code
- fenced code blocks

Optional:
- copy button for code blocks

7. UI/UX REQUIREMENTS

Design:
- Clean modern UI
- Similar to ChatGPT/Open WebUI
- Dark mode default
- Responsive mobile-first
- Sidebar collapsible on mobile
- Header displays:
  provider name
  active model

Buttons:
- New Chat
- Settings
- Stop generating
- Copy message
- Delete chat

8. PROJECT STRUCTURE

Use structure similar to:

src/app/layout.tsx
src/app/page.tsx
src/app/globals.css

src/app/api/chat/route.ts

src/components/ChatApp.tsx
src/components/ChatSidebar.tsx
src/components/ChatMessage.tsx
src/components/ChatInput.tsx
src/components/SettingsModal.tsx
src/components/ModelManager.tsx

src/lib/types.ts
src/lib/storage.ts
src/lib/defaults.ts
src/lib/stream.ts
src/lib/utils.ts

9. DEPENDENCIES

Install and use:
- react-markdown
- remark-gfm
- lucide-react
- clsx
- tailwind-merge

10. CODE QUALITY

Requirements:
- TypeScript strict-friendly
- Reusable components
- Clean architecture
- No unnecessary dependencies
- Lightweight and performant
- Avoid overengineering
- Avoid database
- Avoid authentication
- Avoid server-side API key storage

11. README

Generate README.md including:
- install instructions
- run instructions
- build instructions
- example NVIDIA config
- example OpenRouter config
- note that API keys are stored locally in browser localStorage for MVP

12. FINAL REQUIREMENT

Generate ALL required files completely.

The project must work immediately after:

npm install
npm run dev

Development server should support:

npm run dev -- --host 0.0.0.0

The app should be accessible from Android browser using:
http://127.0.0.1:3000
