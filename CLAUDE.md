# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TeamBuilder is an AI-powered creative team building platform built with Next.js 15 (App Router) and TypeScript. Users can create AI agents with distinct personalities, organize them into teams, and collaborate on design ideation.

## Development Commands

### Essential Commands
```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run linting
npm run lint
```

### Environment Setup
1. Copy `.env.local.example` to `.env.local`
2. Configure required environment variables (OpenAI API key, Upstash Redis, NextAuth secrets)

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS v4
- **Database**: Upstash Redis
- **Authentication**: NextAuth.js
- **AI**: OpenAI API + LangChain
- **Job Queue**: BullMQ with Redis

### Key Architectural Patterns

1. **Server-Side First**: Uses Next.js App Router with Server Components and Server Actions
2. **AI Agent System**: 
   - State machine: idle → plan → action → reflecting
   - Memory system with short-term and long-term storage
   - Background processing via BullMQ
3. **Real-time Updates**: Polling/SSE for agent state synchronization
4. **Data Operations**: Server Actions in `/src/actions/` for mutations

### Directory Structure

```
/src
├── app/           # Next.js App Router pages
│   ├── api/       # API routes for complex operations
│   ├── dashboard/ # Protected dashboard pages
│   └── ideation/  # Main workspace for team collaboration
├── components/    # Reusable React components
├── lib/          # Core utilities and business logic
├── core/         # System prompts for AI agents
└── actions/      # Server Actions for data mutations
```

### Important Code Locations

- **AI Agent Logic**: `/src/lib/ai/` - Agent creation, memory, processing
- **Authentication**: `/src/app/api/auth/` and `middleware.ts`
- **Database Models**: `/src/lib/db.ts` - Redis data structures
- **Agent Prompts**: `/src/core/prompts.ts` - System prompts for agents
- **Background Jobs**: `/src/app/api/agent/process/` - Agent processing queue

### Data Models

1. **User**: Basic auth with email/password
2. **AIAgent**: Personality profiles with roles, traits, memories
3. **Team**: Collections of agents with specific purposes
4. **TeamMember**: Junction table with role assignments
5. **AgentMemory**: v2 architecture with categorized memories

### Key Features

- AI agents with persistent memory and personalities
- Real-time team collaboration in ideation sessions
- Idea generation and evaluation system
- Feedback sessions with AI participation
- Background agent processing for natural interactions

## Development Notes

- Path alias configured: `@/*` maps to `./src/*`
- Protected routes use middleware authentication
- Agent states are managed via Redis and background jobs
- UI components follow shadcn/ui patterns but are custom-built
- Korean language is used in UI and documentation