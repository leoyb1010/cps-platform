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
FROM nginx:1.27-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
