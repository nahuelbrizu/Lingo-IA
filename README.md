# Lingo AI - Conversational Language Tutor

Lingo AI is a real-time conversational language tutoring application. Speech recognition and speech synthesis both run client-side via the browser's Web Speech API; the backend focuses on the AI conversation logic (Claude) and session persistence.

## Project Structure

This is a monorepo project split into two main parts:

- **`/frontend`**: A Next.js application built with React, handling the UI, microphone input, speech recognition/synthesis via the Web Speech API, and WebSocket communication with the backend.
- **`/backend`**: A Node.js server using WebSockets (`ws`), Prisma for database interactions, and the Anthropic API (Claude) for the conversation model.

## Features

- **Browser-based STT (Web Speech API):** The user's speech is transcribed client-side using the browser's native `SpeechRecognition` — only the resulting text is sent to the backend, no raw audio.
- **Claude AI Integration:** Processes the transcribed text using `claude-sonnet-5` with a specific system prompt to act as a friendly Spanish tutor, with tool-calling support.
- **Browser-based TTS (Web Speech API):** The AI's text response is synthesized client-side using the browser's native `speechSynthesis` API — no audio is generated or streamed by the backend.
- **Barge-in capability:** Detects when the user interrupts the AI (Voice Activity Detection - VAD) and instantly cancels the current speech synthesis and the in-flight Claude generation.
- **Pedagogical Summarization:** Automatically summarizes the conversation upon disconnection using `claude-sonnet-5` (via a forced tool call for structured JSON output) to identify common mistakes, mastered topics, and provides personalized feedback, storing the results via Prisma.

## Architecture Highlights

- **Finite State Machine (FSM):** The frontend conversation lifecycle is governed by an FSM (idle -> connecting -> listening -> processing -> ai_speaking), preventing race conditions and inconsistent states.
- **Generation IDs:** A unique `generationId` tracks the lifecycle of an AI response. If the user interrupts (barge-in), the current `generationId` is invalidated, preventing "ghost" speech.
- **SpeechOutputManager Singleton:** A centralized manager wrapping the browser's `speechSynthesis` API, using the same sessionId/generationId locking scheme to allow clean cancellation on barge-in.

## Local Development Setup

### Prerequisites

- Node.js (v20+ recommended)
- An Anthropic API Key (for Claude)
- A browser with Web Speech API support (Chrome, Edge, Safari) for STT + TTS
- Postgres Database (or change the Prisma provider in `backend/prisma/schema.prisma`)
- A Google OAuth app (for NextAuth login only — unrelated to speech/AI)

### Environment Variables

You need to create a `.env` file in the `backend/` directory with the following variables:

```env
# Backend .env
DATABASE_URL="postgresql://user:password@localhost:5432/lingodb?schema=public"
NEXTAUTH_SECRET="your_nextauth_secret_for_jwt_verification"

# Claude (Anthropic)
ANTHROPIC_API_KEY="your_anthropic_api_key"
```

In the `frontend/` directory, create a `.env.local` file:

```env
# Frontend .env.local
NEXT_PUBLIC_WEBSOCKET_URL="ws://localhost:8080"
```

### Installation

Install dependencies from the root directory. This will install dependencies for both the frontend and backend workspaces.

```bash
npm install
```

### Database Setup

Navigate to the `backend/` directory and run Prisma migrations to set up your database schema:

```bash
cd backend
npx prisma migrate dev
```

### Running the Application

You can run both the frontend and backend concurrently from the root directory using:

```bash
npm run dev
```

- The Next.js frontend will be available at `http://localhost:3000`.
- The WebSocket backend will listen on `ws://localhost:8080`.

## Testing

The frontend contains comprehensive tests for the state management, FSM logic, and managers. Run them using:

```bash
cd frontend
npm run test
```