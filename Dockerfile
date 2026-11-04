# Imagem com Chromium e dependências já instaladas (necessário para gerar PDFs)
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# poppler-utils: OCR local de PDFs digitalizados (AI_PROVIDER=local)
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json /app/next.config.ts ./
RUN mkdir -p /app/storage /app/.tesseract-cache && chown -R pwuser:pwuser /app/storage /app/.tesseract-cache
USER pwuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "next", "start", "-p", "3000"]
