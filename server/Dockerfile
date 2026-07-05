# ── build ──────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
# openssl needed by prisma engines
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build
# 预编译 seed / bootstrap 为 JS，运行时无需 ts-node（镜像更小、可非 root 运行）
RUN npx tsc prisma/seed.ts prisma/bootstrap-admin.ts \
      --outDir prisma-dist --module commonjs --target es2021 \
      --esModuleInterop --skipLibCheck --resolveJsonModule

# ── runtime ────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma-dist ./prisma-dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
# 非 root 运行 + 数据卷挂载点可写
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3001
# 启动：迁移(migrate deploy) → bootstrap/seed → 起服务
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
