# competition-service — image độc lập (build context = thư mục service).
#   docker build -t competition-service services/competition-service
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5100

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node . .
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

USER node
EXPOSE 5100
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5100/health/ready || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/main.js"]
