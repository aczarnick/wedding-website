# Builder stage
FROM node:18-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --production=false

COPY . .
RUN npm run build

# Runtime stage
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/tailwind.config.cjs ./
COPY --from=builder /app/postcss.config.js ./
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/styles ./styles
COPY --from=builder /app/data/migrations ./data/migrations
RUN npm install --omit=dev && npm cache clean --force

VOLUME ["/app/data"]
EXPOSE 80

CMD ["sh", "-c", "npm run start -- --port 80"]
