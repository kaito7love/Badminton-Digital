# Image frontend (nginx) cho cụm docker compose. Context: gốc repo — để lấy
# được cả frontend/ lẫn docker/nginx.conf; .dockerignore ở gốc chỉ cho vào đúng
# những thư mục đó.

# Stage 1: build
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Khối "Tài khoản thử nghiệm" trên trang đăng nhập là hằng số lúc build (bản
# build thường không chứa chuỗi mật khẩu demo nào).
ARG VITE_SHOW_DEMO_ACCOUNTS=false
ENV VITE_SHOW_DEMO_ACCOUNTS=${VITE_SHOW_DEMO_ACCOUNTS}
RUN npm run build

# Stage 2: serve — nginx proxy /api, /static tới backend và SPA fallback (DEP-01)
FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
