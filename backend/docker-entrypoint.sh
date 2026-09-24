#!/bin/sh
# Chạy migration trước khi server nhận request (DEP-02). `set -e`: migrate lỗi
# thì container dừng — không có server nào chạy trên schema thiếu bảng.
# Idempotent: migration đã chạy nằm trong bảng SequelizeMeta, lần khởi động sau
# (kể cả mỗi lần Render đánh thức service) chỉ tốn một lần kiểm tra.
# Không seed ở đây: dữ liệu demo do scripts/demo-reset.js lo.
set -e

node scripts/wait-for-db.js
echo "[entrypoint] Chạy migration..."
node node_modules/sequelize-cli/lib/sequelize db:migrate
echo "[entrypoint] Migration xong, khởi động server."

exec "$@"
