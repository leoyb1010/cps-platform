# ── build ──────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# 容器内：真实模式，API 走同源 /api（由 nginx 反代到 server）
RUN printf 'VITE_API_MODE=real\nVITE_API_BASE=/api\n' > .env.production
RUN npm run build

# ── serve ──────────────────────────────────────────
# 非 root 运行（unprivileged 镜像默认 uid 101、监听 8080）——缩小容器被攻破后的权限面
FROM nginxinc/nginx-unprivileged:1.27-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
# 镜像自带健康检查兜底（compose 未接管时也可探活）
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:8080/ || exit 1
