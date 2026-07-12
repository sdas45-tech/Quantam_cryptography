# Stage 1: Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Turn off telemetry during the build phase
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Stage 2: Final runner stage
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-privileged system user for running Next.js
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built public files and package/server files
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy assets and standalone Next.js server configs if enabled,
# otherwise copy full client builds.
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Serve the application
CMD ["npm", "run", "start"]
