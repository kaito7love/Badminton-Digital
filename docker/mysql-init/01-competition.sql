-- Database thứ hai cho competition-service (plan 24). Image mysql chỉ chạy các file trong
-- /docker-entrypoint-initdb.d khi volume còn TRỐNG; máy đã có volume thì tạo tay một lần
-- (xem docs/DeploymentGuide.md mục 5).
CREATE DATABASE IF NOT EXISTS competition_service CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON competition_service.* TO 'bp_user'@'%';
FLUSH PRIVILEGES;
