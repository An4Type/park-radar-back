FROM mcr.microsoft.com/playwright:v1.58.2-noble AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://parking:parking_dev_password@postgres:5432/parking
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json prisma.config.ts ./
COPY packages ./packages
COPY apps ./apps
RUN npm run generate && npm run build

FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/database/generated ./packages/database/generated
CMD ["node", "dist/apps/worker/src/index.js"]
