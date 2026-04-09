# UPMY - Universal Project Management System

A comprehensive project management system built with Next.js 15, featuring integrations with Jira, Trello, TestRail, and AI-powered insights.

## 🚀 Quick Start

### Development Mode
```bash
npm run dev
```
Starts the application in **development mode** with:
- HTTPS enabled (requires SSL certificates)
- Hot reload and fast refresh
- Development optimizations
- Detailed error reporting

### Production Mode
```bash
npm run build && npm start
```
Or use the shorthand:
```bash
npm run prod
```
Builds and starts the application in **production mode** with:
- Code minification and optimization
- Static generation where possible
- Server-side rendering
- Asset optimization
- Production performance monitoring

## 📋 Available Scripts

| Script | Description | Mode |
|--------|-------------|------|
| `npm run dev` | Start HTTPS development server | Development |
| `npm run dev:http` | Start HTTP development server (port 9003) | Development |
| `npm run build` | Build the application for production | Production |
| `npm run start` | Start production HTTPS server | Production |
| `npm run prod` | Build and start production server | Production |
| `npm run lint` | Run ESLint for code quality | - |
| `npm run typecheck` | Run TypeScript type checking | - |

## 🔒 HTTPS Setup

This project uses HTTPS in both development and production. SSL certificates are required.

### First Time Setup
1. Install mkcert:
   - **Windows**: `choco install mkcert` or `scoop install mkcert`
   - **macOS**: `brew install mkcert`
   - **Linux**: Follow [mkcert installation guide](https://github.com/FiloSottile/mkcert)

2. Install local CA: `mkcert -install`

3. Generate certificates: `mkcert localhost 127.0.0.1 ::1`

4. Run the development server: `npm run dev`

## 🌍 Environment Modes

The application automatically detects and configures based on `NODE_ENV`:

- **Development** (`NODE_ENV=development`): Enabled debugging, hot reload, detailed errors
- **Production** (`NODE_ENV=production`): Optimized builds, minified code, performance monitoring

## 🛠 Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: MongoDB
- **Authentication**: NextAuth.js
- **AI**: Google Genkit
- **Integrations**: Jira, Trello, TestRail APIs
- **Charts**: Recharts, Custom Gantt Charts

## 📁 Project Structure

```
src/
├── app/                 # Next.js App Router pages
├── components/          # Reusable UI components
├── hooks/              # Custom React hooks
├── lib/                # Utility functions and services
├── types/              # TypeScript type definitions
└── ai/                 # AI/Genkit related code
```

To get started with development, run `npm run dev` and visit `https://localhost:9003`.
