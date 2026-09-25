# Image backend cho cụm docker compose (context: backend/).
FROM node:22-alpine
WORKDIR /app

# Image này luôn chạy production, bất kể NODE_ENV trong backend/.env (DEP-04).
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --chown: tiến trình chạy bằng user "node" phải ghi được sơ đồ sân vào
# public/layouts (DEP-03). backups/, tests/, docs/ bị loại bởi backend/.dockerignore.
COPY --chown=node:node . .
RUN sed -i 's/\r$//' docker-entrypoint.sh \
 && chmod +x docker-entrypoint.sh \
 && mkdir -p public/layouts \
 && chown node:node public/layouts

# node:22-alpine có sẵn user "node" — không chạy bằng root.
USER node
EXPOSE 5000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
