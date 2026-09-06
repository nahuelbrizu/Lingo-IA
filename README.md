# Lingo AI - Conversational Language Tutor

Lingo AI is a real-time conversational language tutoring application. Speech recognition runs client-side via the browser's Web Speech API; speech synthesis runs server-side via Google Cloud TTS; the AI conversation logic (Claude) can teach and translate between several languages.

## Project Structure

This is a monorepo project split into two main parts:

- **`/frontend`**: A Next.js application built with React, handling the UI, microphone input, speech recognition via the Web Speech API, and WebSocket communication with the backend.
- **`/backend`**: A Node.js server using WebSockets (`ws`), Prisma for database interactions, the Anthropic API (Claude) for the conversation model, and Google Cloud Text-to-Speech for the AI's voice.

## Features

- **Browser-based STT (Web Speech API):** The user's speech is transcribed client-side using the browser's native `SpeechRecognition` — only the resulting text is sent to the backend, no raw audio.
- **Claude AI Integration:** Processes the transcribed text using `claude-sonnet-5` with a system prompt tailored to the chosen target language, with tool-calling support.
- **Multi-language support:** English, Spanish, French, German, Italian, Portuguese, Japanese, and Mandarin Chinese — selectable as the language being learned.
- **On-demand translation:** Each AI reply has a "Translate" button that asks Claude to translate it into the student's own native language (also selectable), so a complete beginner can still follow along. The tutor's system prompt also knows the student's native language and can briefly clarify in it when the student seems lost.
- **Google Cloud TTS:** The AI's text response is synthesized server-side using Google Cloud Text-to-Speech (voice matches the language being learned) and streamed to the client as an MP3, played via the Web Audio API.
- **Barge-in capability:** Detects when the user interrupts the AI (Voice Activity Detection - VAD) and instantly cancels the current audio playback and the in-flight Claude generation.
- **Pedagogical Summarization:** Automatically summarizes the conversation upon disconnection using `claude-sonnet-5` (via a forced tool call for structured JSON output) to identify common mistakes, mastered topics, and provides personalized feedback, storing the results via Prisma.

## Architecture Highlights

- **Finite State Machine (FSM):** The frontend conversation lifecycle is governed by an FSM (idle -> connecting -> listening -> processing -> ai_speaking), preventing race conditions and inconsistent states.
- **Generation IDs:** A unique `generationId` tracks the lifecycle of an AI response. If the user interrupts (barge-in), the current `generationId` is invalidated, preventing "ghost" audio.
- **AudioOutputManager Singleton:** A centralized manager for playing the AI's synthesized audio, using sessionId/generationId locking to allow clean cancellation on barge-in.

## Local Development Setup

### Prerequisites

- Node.js (v20+ recommended)
- An Anthropic API Key (for Claude)
- A Google Cloud API key with the Cloud Text-to-Speech API enabled (billing must be active on the project)
- A browser with Web Speech API support (Chrome, Edge, Safari) for speech recognition
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

# Google Cloud (Text-to-Speech)
GOOGLE_CLOUD_API_KEY="your_google_cloud_api_key"
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