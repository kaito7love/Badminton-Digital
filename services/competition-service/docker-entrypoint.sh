#!/bin/sh
# Chờ DB → migrate (DB riêng của service, SequelizeMeta riêng) → chạy. `set -e`:
# migrate lỗi thì container dừng, không có server nào chạy trên schema thiếu bảng.
set -e

node scripts/wait-for-db.js
echo "[competition-entrypoint] Chạy migration..."
node node_modules/sequelize-cli/lib/sequelize db:migrate
echo "[competition-entrypoint] Migration xong, khởi động service."

exec "$@"
