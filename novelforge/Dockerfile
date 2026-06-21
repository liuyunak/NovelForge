# ============================================================
# NovelForge Docker — Multi-stage build for production
# ============================================================

# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS frontend-builder
WORKDIR /app/studio

COPY studio/package.json studio/pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY studio/ ./
RUN pnpm build

# ---- Stage 2: Build backend ----
FROM node:20-alpine AS backend-builder
WORKDIR /app

# Install ALL deps (including devDependencies: typescript, tsx, etc.) so we can compile.
# The runtime stage keeps a separate --prod install, so devDeps never ship.
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Compile TypeScript to dist/. tsconfig has noEmitOnError disabled, so JS is
# emitted even if some type-only errors remain (runtime behaviour is unaffected).
RUN pnpm exec tsc

# ---- Stage 3: Production runtime ----
FROM node:20-alpine

# Install python3 for optional training scripts
RUN apk add --no-cache python3 py3-pip bash curl

WORKDIR /app

# Runtime dependencies only (no devDependencies)
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Copy the COMPILED backend (dist/) and source for reference
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/scripts ./scripts
COPY --from=backend-builder /app/tsconfig.json ./tsconfig.json

# Copy frontend static assets
COPY --from=frontend-builder /app/studio/dist ./studio/dist

# Copy config templates (Setup Wizard will overwrite on first run)
COPY .env.example ./.env

# Create necessary directories
RUN mkdir -p workspace data/training data/processed models exports logs

# Expose API port — kept in sync with config.ts default (PORT=3001)
EXPOSE 3001

# Health check — route is /health (defined in src/index.ts), NOT /api/health
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Run the compiled server (entry: src/index.ts → dist/index.js)
CMD ["node", "dist/index.js"]
