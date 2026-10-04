require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');
const requestContextMiddleware = require('./middleware/requestContextMiddleware');
const OnlineOrderService = require('./services/OnlineOrderService');
const SalesOrderService = require('./services/SalesOrderService');
const { resolveCorsOrigin, resolveTrustProxy } = require('./utils/serverConfig');
const { createFrontendHandlers } = require('./utils/frontendStatic');
const { getCompetitionConfig } = require('./integrations/competition/config');
const { createGatewayRouter } = require('./integrations/competition/gateway');
const { createDispatcher } = require('./integrations/competition/dispatcher');
const { createCompetitionWebhookRouter } = require('./routes/competitionWebhookRoutes');
const AuditService = require('./services/AuditService');

// Tích hợp competition-service (plan 23): không đặt biến COMPETITION_* → tắt hẳn; đặt dở dang thì dừng ngay ở đây
// (cùng tinh thần jwt secrets) thay vì chạy nửa vời.
const competition = getCompetitionConfig();

const app = express();

// Số proxy đứng trước Express — không đặt thì rate limit đếm theo IP của proxy
// (xem utils/serverConfig.js).
app.set('trust proxy', resolveTrustProxy());
app.disable('x-powered-by');

app.use(cors({
  origin: resolveCorsOrigin(),
  credentials: true,
  // Cho phép frontend đọc tên file khi tải báo cáo Excel/PDF
  exposedHeaders: ['Content-Disposition']
}));
// Webhook của competition-service tự giữ rawBody để kiểm chữ ký — phải đứng trước express.json() toàn cục.
app.use('/api/v1/integrations/competition', createCompetitionWebhookRouter({
  config: competition,
  sequelize,
  models: require('./models'),
  record: AuditService.record
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestContextMiddleware);

// Health Check Endpoints
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
// `ip` là IP của chính người gọi như server nhìn thấy — dùng để kiểm
// TRUST_PROXY_HOPS trên môi trường thật (phải ra IP của bạn, không phải của proxy).
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', time: new Date(), ip: req.ip }));

// Sơ đồ mặt bằng sân theo chi nhánh: file JSON tĩnh, cập nhật bằng cách sửa
// file trực tiếp (không qua DB) — chỉ chứa toạ độ hình học, không dữ liệu
// nhạy cảm nên không cần auth.
app.use('/static/layouts', express.static(path.join(__dirname, '../public/layouts')));

// Swagger UI — tài liệu API tương tác tại /api-docs.
//
// Trang này phơi TOÀN BỘ bề mặt API (112 endpoint kèm body mẫu), nên ở
// production phải bật có ý thức bằng ENABLE_API_DOCS=true; mặc định tắt.
// Dev/test luôn bật vì đó là chỗ nó có ích.
//
// Spec là file sinh tự động từ Postman collection — xem scripts/collection-to-openapi.js.
const apiDocsEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true';
if (apiDocsEnabled) {
  const swaggerUi = require('swagger-ui-express');
  const YAML = require('yamljs');
  const specPath = path.join(__dirname, 'docs', 'openapi.yaml');

  if (fs.existsSync(specPath)) {
    const swaggerDocument = YAML.load(specPath);
    app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup(swaggerDocument, {
        customSiteTitle: 'Badminton Digital API',
        swaggerOptions: {
          // Mặc định Swagger UI bung hết mọi tag; 23 nhóm mở sẵn thì không đọc nổi.
          docExpansion: 'none',
          // Giữ token sau khi F5 — đỡ phải Authorize lại mỗi lần đổi trang.
          persistAuthorization: true,
          filter: true,
          // Gắn anchor theo tag/operation vào URL để gửi link thẳng tới một endpoint.
          deepLinking: true,
          displayRequestDuration: true
        }
      })
    );
    // Cho công cụ khác (sinh SDK, import Postman/Insomnia) tải spec thô.
    app.get('/api-docs.json', (req, res) => res.json(swaggerDocument));
  } else {
    console.warn('⚠️  Chưa có src/docs/openapi.yaml — chạy `npm run docs:build` để sinh. Bỏ qua /api-docs.');
  }
}

// Register API Routes
// Trang chủ công khai: chỉ đọc danh mục sân và khung giờ trống, không cần đăng nhập
app.use('/api/v1/public', require('./routes/publicRoutes'));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/courts', require('./routes/courtRoutes'));
app.use('/api/v1/realtime', require('./routes/realtimeRoutes'));
app.use('/api/v1/bookings', require('./routes/bookingRoutes'));
app.use('/api/v1/accessories', require('./routes/accessoryRoutes'));
app.use('/api/v1/suppliers', require('./routes/supplierRoutes'));
app.use('/api/v1/goods-receipts', require('./routes/goodsReceiptRoutes'));
app.use('/api/v1/inventory', require('./routes/inventoryRoutes'));
app.use('/api/v1/product-categories', require('./routes/productCategoryRoutes'));
app.use('/api/v1/products', require('./routes/productRoutes'));
app.use('/api/v1/vouchers', require('./routes/voucherRoutes'));
app.use('/api/v1/sales-orders', require('./routes/salesOrderRoutes'));
// Đơn khách tự đặt trên web — cùng bảng sales_orders, khác đường vào và khác quyền
app.use('/api/v1/my-orders', require('./routes/myOrderRoutes'));
app.use('/api/v1/branches', require('./routes/branchRoutes'));
app.use('/api/v1/sessions', require('./routes/sessionRoutes'));
app.use('/api/v1/customers', require('./routes/customerRoutes'));
app.use('/api/v1/employees', require('./routes/employeeRoutes'));
app.use('/api/v1/payments', require('./routes/paymentRoutes'));
app.use('/api/v1/invoices', require('./routes/invoiceRoutes'));
app.use('/api/v1/activity-logs', require('./routes/activityLogRoutes'));
app.use('/api/v1/reports', require('./routes/reportRoutes'));
app.use('/api/v1/settings', require('./routes/settingRoutes'));
// Cổng nối tới competition-service (tắt → 503 COMPETITION_DISABLED, phần còn lại của app không bị ảnh hưởng)
app.use('/api/v1/competition', createGatewayRouter({ config: competition }));

// Image 1 container (Render): backend phục vụ luôn bản build frontend, cùng
// origin với API. Không đặt FRONTEND_DIST_DIR (dev, cụm compose) thì bỏ qua.
const frontend = createFrontendHandlers(process.env.FRONTEND_DIST_DIR);
if (frontend) {
  app.use(frontend.staticFiles);
  app.use(frontend.spaFallback);
}

// Route không khớp bất kỳ mount nào ở trên — trả đúng envelope chuẩn thay
// vì để Express tự render trang lỗi HTML mặc định.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    message: 'Không tìm thấy endpoint.',
    errors: null
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Verify Database Connection before listening
sequelize.authenticate()
  .then(() => {
    console.log('✅ Database connection to MySQL has been established successfully.');
  })
  .catch(err => {
    console.error('❌ Unable to connect to MySQL database:', err.message);
    console.error('👉 Vui lòng kiểm tra dịch vụ MySQL (đã bật chưa, đúng port/user/pass trong backend/.env chưa).');
  });

app.listen(PORT, () => {
  console.log(`🚀 Badminton Digital Management API running at http://localhost:${PORT}`);
});

// Đơn online chọn chuyển khoản mà quá 30 phút không thanh toán thì tự huỷ,
// trả hàng về kệ — quét mỗi 5 phút là đủ nhặt kịp (khách chờ tối đa ~35 phút,
// không cần chính xác tới giây). Không chạy khi test require trực tiếp từng
// service/route — chỉ chạy khi chính server.js này được khởi động.
// Cùng nhịp đó: đơn tại quầy bỏ dở quá 6 giờ (tab đóng, máy tắt giữa lúc quét
// hàng) được huỷ để hàng về lại kho (FE-02).
setInterval(() => {
  OnlineOrderService.expireStalePendingOrders().catch((err) => {
    console.error('❌ Lỗi khi quét đơn online quá hạn thanh toán:', err.message);
  });
  SalesOrderService.releaseAbandonedPosOrders().catch((err) => {
    console.error('❌ Lỗi khi dọn đơn tại quầy bỏ dở:', err.message);
  });
}, 5 * 60 * 1000);

// Gửi sự kiện khách (gộp / xoá / đổi tên) sang competition-service — chỉ khi đã cấu hình.
if (competition.enabled) {
  createDispatcher({ config: competition, sequelize, model: require('./models').IntegrationOutbox }).start();
  console.log('🏸 Tích hợp competition-service đã bật:', competition.serviceUrl);
}

module.exports = app;
