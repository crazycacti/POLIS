FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3050
ENV HOSTNAME=0.0.0.0

COPY docker/fonts/local.conf /etc/fonts/local.conf
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core fonts-liberation \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public/poster-marks ./public/poster-marks
COPY --from=builder /app/public/age-marks ./public/age-marks

RUN mkdir -p /app/assets/fonts \
  && cp /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf /app/assets/fonts/DejaVuSans.ttf \
  && cp /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf /app/assets/fonts/DejaVuSans-Bold.ttf

EXPOSE 3050

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3050/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "--bun", "server.js"]
