FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=pwuser:pwuser src ./src
RUN mkdir -p /app/screenshots && chown pwuser:pwuser /app/screenshots
USER pwuser
CMD ["node", "src/worker.js"]
