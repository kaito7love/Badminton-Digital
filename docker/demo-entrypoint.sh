#!/bin/sh
# Entrypoint của bản demo Render (docker/app.Dockerfile): MỘT container, hai process (plan 24).
#   1. chờ DB → migrate DB chính (như backend/docker-entrypoint.sh);
#   2. nếu đặt COMPETITION_DB_NAME: sinh khoá + cấu hình (scripts/competition-boot.js), rồi chạy NỀN một vòng lặp cho
#      competition-service: chờ DB thứ hai → migrate → chạy service (chỉ nghe 127.0.0.1) → chết thì làm lại sau 5 giây;
#   3. `exec` backend — vẫn là process chính (PID 1), /health vẫn là health check của Render, và KHÔNG phải chờ service
#      (Render free chỉ 0,1 CPU: migrate DB thứ hai mất ~30 giây — đặt trước backend hoặc chạy song song thì /health xanh chậm hơn
#      hẳn; nên vòng lặp service đợi backend lên rồi mới bắt đầu).
#      Trong lúc service chưa lên, cổng thi đấu trả 503 COMPETITION_UNAVAILABLE; phần còn lại của app chạy bình thường.
# `set -e` vẫn dừng container khi DB chính không nối được / migrate DB chính lỗi / thiếu secret thi đấu. Service không bao
# giờ chạy trên schema thiếu bảng: migrate lỗi thì vòng lặp thử lại, không chạy service. Không đặt COMPETITION_DB_NAME
# thì y như trước: chỉ backend.
set -e

node scripts/wait-for-db.js
echo "[entrypoint] Chạy migration..."
node node_modules/sequelize-cli/lib/sequelize db:migrate
echo "[entrypoint] Migration xong."

if [ -n "$COMPETITION_DB_NAME" ]; then
  # Tách phép gán khỏi eval: `eval "$(lệnh)"` nuốt mã thoát của lệnh nên `set -e` không bắt được.
  boot_env=$(node scripts/competition-boot.js)
  eval "$boot_env"
  unset boot_env

  (
    cd competition-service
    # Đợi backend nhận request rồi mới migrate / chạy service: hai bên tranh nhau 0,1 CPU của Render free thì /health xanh chậm hơn.
    until wget -qO- "http://127.0.0.1:${PORT:-5000}/health" >/dev/null 2>&1; do sleep 2; done
    while true; do
      if DB_NAME="$COMPETITION_DB_NAME" node scripts/wait-for-db.js \
        && DB_NAME="$COMPETITION_DB_NAME" node node_modules/sequelize-cli/lib/sequelize db:migrate; then
        echo "[entrypoint] competition-service: migration xong, khởi động (127.0.0.1:${COMPETITION_SERVICE_PORT:-5100})."
        # Service không cần JWT secret của app chính; heap 160 MB để hai process vừa 512 MB của Render free.
        env -u JWT_ACCESS_SECRET -u JWT_REFRESH_SECRET \
          DB_NAME="$COMPETITION_DB_NAME" HOST=127.0.0.1 PORT="${COMPETITION_SERVICE_PORT:-5100}" \
          node --max-old-space-size=160 src/main.js || true
        echo "[entrypoint] competition-service dừng, thử lại sau 5 giây."
      else
        echo "[entrypoint] competition-service: DB / migration lỗi — thử lại sau 5 giây (app chính vẫn chạy)."
      fi
      sleep 5
    done
  ) &
  echo "[entrypoint] competition-service chuẩn bị chạy nền."
else
  # Backend chỉ chấp nhận cấu hình tích hợp đủ hoặc không có gì — xoá hai secret Render đã sinh sẵn.
  unset COMPETITION_EVENT_SECRET COMPETITION_WEBHOOK_SECRET
  echo "[entrypoint] COMPETITION_DB_NAME trống → tắt tích hợp thi đấu."
fi

echo "[entrypoint] Khởi động server."
exec "$@"
