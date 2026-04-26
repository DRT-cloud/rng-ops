# --- Build stage ---
# Pinned to Node 20 LTS: better-sqlite3 prebuilt binaries exist for Node 20
# but not for current/odd Node versions (22+). Do not bump without verifying
# https://github.com/WiseLibs/better-sqlite3/releases
FROM node:20.18-alpine AS build
WORKDIR /app

# Install build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

# Install dependencies with a cached layer
COPY package.json package-lock.json* ./
RUN npm ci

# Build the client and bundle the server
COPY . .
RUN npm run build

# --- Runtime stage ---
FROM node:20.18-alpine AS runtime
WORKDIR /app

# Runtime deps for better-sqlite3 native binary
RUN apk add --no-cache libstdc++

# Copy only what we need to run
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Data directory for the SQLite file (mount a volume here in production)
RUN mkdir -p /data
ENV DATABASE_PATH=/data/data.db
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000
CMD ["node", "dist/index.cjs"]
