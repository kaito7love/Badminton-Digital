# Image 1 container cho bản demo trên Render (render.yaml): backend phục vụ luôn
# bản build frontend, cùng origin với API — không cần CORS, rewrite hay nginx;
# SSE đi thẳng tới Express. Context: gốc repo (xem .dockerignore ở gốc).
#
# Render tự truyền biến môi trường của service thành build-arg, nên đặt
# VITE_SHOW_DEMO_ACCOUNTS=true trên Render là bản build có khối tài khoản thử nghiệm.

# Stage 1: build frontend
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_SHOW_DEMO_ACCOUNTS=false
ENV VITE_SHOW_DEMO_ACCOUNTS=${VITE_SHOW_DEMO_ACCOUNTS}
RUN npm run build

# Stage 2: backend + bản build frontend
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node backend/ ./
COPY --from=frontend --chown=node:node /app/dist ./public/app

# competition-service (plan 24): cài dependency trước để cache layer, rồi mới chép mã.
COPY services/competition-service/package*.json ./competition-service/
RUN cd competition-service && npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node services/competition-service/ ./competition-service/

COPY --chown=node:node docker/demo-entrypoint.sh ./demo-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh demo-entrypoint.sh \
 && chmod +x docker-entrypoint.sh demo-entrypoint.sh \
 && mkdir -p public/layouts \
 && chown node:node public/layouts

ENV FRONTEND_DIST_DIR=/app/public/app
USER node
EXPOSE 5000
# Chạy backend, và competition-service nếu đặt COMPETITION_DB_NAME (xem docker/demo-entrypoint.sh).
ENTRYPOINT ["./demo-entrypoint.sh"]
CMD ["node", "src/server.js"]
