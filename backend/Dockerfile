# Minimal, fast-boot Node.js 20 runtime for GCP Cloud Run
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DOCK_DIR=/app/dock

# Copy package manifests & source files
COPY package.json ./
COPY src ./src
COPY dock ./dock

USER node

EXPOSE 8080

CMD ["node", "src/index.mjs"]
