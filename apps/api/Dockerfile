FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://parking:parking_dev_password@postgres:5432/parking
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json prisma.config.ts vitest.config.ts ./
COPY packages ./packages
COPY apps ./apps
COPY tests ./tests
RUN npm run generate && npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/packages/database/prisma ./packages/database/prisma
COPY --from=build /app/packages/database/generated ./packages/database/generated
EXPOSE 3000
CMD ["node", "dist/apps/api/src/index.js"]
