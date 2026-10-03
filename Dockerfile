# A single image is used for both Railway services. Set SERVICE_ROLE to `api`
# or `worker` at runtime; keeping one build context lets both services use the
# shared database package without relying on Compose.
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS build

WORKDIR /app

# The Playwright base image already contains Chromium and its system libraries.
ENV DATABASE_URL=postgresql://parking:parking_dev_password@postgres:5432/parking
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json prisma.config.ts vitest.config.ts ./
COPY packages ./packages
COPY apps ./apps
COPY tests ./tests

RUN npm run generate && npm run build

FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/packages/database/prisma ./packages/database/prisma
COPY --from=build /app/packages/database/generated ./packages/database/generated
COPY scripts/start-service.sh ./scripts/start-service.sh

EXPOSE 3000
CMD ["sh", "/app/scripts/start-service.sh"]
