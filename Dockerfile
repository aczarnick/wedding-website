# Builder stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci && \
    npm cache clean --force

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Create nextjs user/group for security
RUN addgroup -g 1001 -S nextjs && \
    adduser -S nextjs -u 1001 && \
    mkdir -p /app/.next && \
    chown -R nextjs:nextjs /app

USER nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
# Copy static assets
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
# Copy public folder for images and other static files
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

EXPOSE 3000

# Health check for monitoring
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]