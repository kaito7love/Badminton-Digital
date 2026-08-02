require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoints
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Register API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/courts', require('./routes/courtRoutes'));
app.use('/api/v1/bookings', require('./routes/bookingRoutes'));
app.use('/api/v1/accessories', require('./routes/accessoryRoutes'));
app.use('/api/v1/sessions', require('./routes/sessionRoutes'));
app.use('/api/v1/customers', require('./routes/customerRoutes'));
app.use('/api/v1/employees', require('./routes/employeeRoutes'));
app.use('/api/v1/payments', require('./routes/paymentRoutes'));
app.use('/api/v1/invoices', require('./routes/invoiceRoutes'));
app.use('/api/v1/reports', require('./routes/reportRoutes'));
app.use('/api/v1/settings', require('./routes/settingRoutes'));

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

module.exports = app;
