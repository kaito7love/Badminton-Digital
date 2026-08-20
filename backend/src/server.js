require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');
const requestContextMiddleware = require('./middleware/requestContextMiddleware');
const OnlineOrderService = require('./services/OnlineOrderService');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  // Cho phép frontend đọc tên file khi tải báo cáo Excel/PDF
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestContextMiddleware);

// Health Check Endpoints
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Register API Routes
// Trang chủ công khai: chỉ đọc danh mục sân và khung giờ trống, không cần đăng nhập
app.use('/api/v1/public', require('./routes/publicRoutes'));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/courts', require('./routes/courtRoutes'));
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
app.use('/api/v1/reports', require('./routes/reportRoutes'));
app.use('/api/v1/settings', require('./routes/settingRoutes'));

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
setInterval(() => {
  OnlineOrderService.expireStalePendingOrders().catch((err) => {
    console.error('❌ Lỗi khi quét đơn online quá hạn thanh toán:', err.message);
  });
}, 5 * 60 * 1000);

module.exports = app;
