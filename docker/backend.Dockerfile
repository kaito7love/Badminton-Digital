FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 5000
# node:18-alpine đã có sẵn user "node" — chạy bằng user thường thay vì root
# mặc định, giới hạn thiệt hại nếu có lỗ hổng RCE nào khác trong ứng dụng.
USER node
CMD ["node", "src/server.js"]
