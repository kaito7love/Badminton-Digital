const { Sequelize } = require('sequelize');
const env = process.env.NODE_ENV || 'development';
const config = require('../config/config.js')[env];

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

const db = {};

// Import Models
db.Role = require('./Role')(sequelize);
db.User = require('./User')(sequelize);
db.Employee = require('./Employee')(sequelize);
db.Customer = require('./Customer')(sequelize);
db.Court = require('./Court')(sequelize);
db.Booking = require('./Booking')(sequelize);
db.CourtSession = require('./CourtSession')(sequelize);
db.Extra = require('./Extra')(sequelize);
db.SessionExtra = require('./SessionExtra')(sequelize);
db.Invoice = require('./Invoice')(sequelize);
db.InvoiceLine = require('./InvoiceLine')(sequelize);
db.Payment = require('./Payment')(sequelize);
db.Setting = require('./Setting')(sequelize);
db.ActivityLog = require('./ActivityLog')(sequelize);
db.Branch = require('./Branch')(sequelize);
db.BranchDocumentSequence = require('./BranchDocumentSequence')(sequelize);
db.Supplier = require('./Supplier')(sequelize);
db.ExtraStock = require('./ExtraStock')(sequelize);
db.StockMovement = require('./StockMovement')(sequelize);
db.GoodsReceipt = require('./GoodsReceipt')(sequelize);
db.GoodsReceiptItem = require('./GoodsReceiptItem')(sequelize);
db.ProductCategory = require('./ProductCategory')(sequelize);
db.Product = require('./Product')(sequelize);
db.ProductVariant = require('./ProductVariant')(sequelize);
db.ProductStock = require('./ProductStock')(sequelize);
db.SalesOrder = require('./SalesOrder')(sequelize);
db.SalesOrderLine = require('./SalesOrderLine')(sequelize);

// Associations
// Role <-> User
db.Role.hasMany(db.User, { foreignKey: 'roleId', as: 'users' });
db.User.belongsTo(db.Role, { foreignKey: 'roleId', as: 'role' });

// User <-> Employee (1-1)
db.User.hasOne(db.Employee, { foreignKey: 'userId', as: 'employee' });
db.Employee.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

// Branch context
db.Branch.hasMany(db.Court, { foreignKey: 'branchId', as: 'courts' });
db.Court.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Branch.hasMany(db.Booking, { foreignKey: 'branchId', as: 'bookings' });
db.Booking.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Branch.hasMany(db.CourtSession, { foreignKey: 'branchId', as: 'sessions' });
db.CourtSession.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Branch.hasMany(db.Employee, { foreignKey: 'branchId', as: 'employees' });
db.Employee.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Branch.hasMany(db.Invoice, { foreignKey: 'branchId', as: 'invoices' });
db.Invoice.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Branch.hasMany(db.Payment, { foreignKey: 'branchId', as: 'payments' });
db.Payment.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Branch.hasMany(db.BranchDocumentSequence, { foreignKey: 'branchId', as: 'documentSequences' });
db.BranchDocumentSequence.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });

// User <-> Customer (1-1, optional)
db.User.hasOne(db.Customer, { foreignKey: 'userId', as: 'customer' });
db.Customer.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

// Court <-> Booking
db.Court.hasMany(db.Booking, { foreignKey: 'courtId', as: 'bookings' });
db.Booking.belongsTo(db.Court, { foreignKey: 'courtId', as: 'court' });

// Customer <-> Booking
db.Customer.hasMany(db.Booking, { foreignKey: 'customerId', as: 'bookings' });
db.Booking.belongsTo(db.Customer, { foreignKey: 'customerId', as: 'customer' });

// User (Creator) <-> Booking
db.User.hasMany(db.Booking, { foreignKey: 'createdBy', as: 'createdBookings' });
db.Booking.belongsTo(db.User, { foreignKey: 'createdBy', as: 'creator' });

// Court <-> CourtSession
db.Court.hasMany(db.CourtSession, { foreignKey: 'courtId', as: 'sessions' });
db.CourtSession.belongsTo(db.Court, { foreignKey: 'courtId', as: 'court' });

// Booking <-> CourtSession (1-1, optional)
db.Booking.hasOne(db.CourtSession, { foreignKey: 'bookingId', as: 'session' });
db.CourtSession.belongsTo(db.Booking, { foreignKey: 'bookingId', as: 'booking' });

// Customer <-> CourtSession
db.Customer.hasMany(db.CourtSession, { foreignKey: 'customerId', as: 'sessions' });
db.CourtSession.belongsTo(db.Customer, { foreignKey: 'customerId', as: 'customer' });

// Employee <-> CourtSession
db.Employee.hasMany(db.CourtSession, { foreignKey: 'employeeId', as: 'sessions' });
db.CourtSession.belongsTo(db.Employee, { foreignKey: 'employeeId', as: 'employee' });

// CourtSession <-> SessionExtra <-> Extra
db.CourtSession.hasMany(db.SessionExtra, { foreignKey: 'sessionId', as: 'sessionExtras' });
db.SessionExtra.belongsTo(db.CourtSession, { foreignKey: 'sessionId', as: 'session' });

db.Extra.hasMany(db.SessionExtra, { foreignKey: 'extraId', as: 'sessionExtras' });
db.SessionExtra.belongsTo(db.Extra, { foreignKey: 'extraId', as: 'extra' });

// CourtSession <-> Invoice (1-1)
db.CourtSession.hasOne(db.Invoice, { foreignKey: 'sessionId', as: 'invoice' });
db.Invoice.belongsTo(db.CourtSession, { foreignKey: 'sessionId', as: 'session' });

// Invoice <-> Payment (1-1)
db.Invoice.hasOne(db.Payment, { foreignKey: 'invoiceId', as: 'payment' });
db.Payment.belongsTo(db.Invoice, { foreignKey: 'invoiceId', as: 'invoice' });

// Invoice <-> InvoiceLine (1-n) — dòng chi tiết hoá đơn (tiền sân/sản phẩm/giảm giá...)
db.Invoice.hasMany(db.InvoiceLine, { foreignKey: 'invoiceId', as: 'lines', onDelete: 'CASCADE' });
db.InvoiceLine.belongsTo(db.Invoice, { foreignKey: 'invoiceId', as: 'invoice' });

// Employee <-> Payment
db.Employee.hasMany(db.Payment, { foreignKey: 'employeeId', as: 'payments' });
db.Payment.belongsTo(db.Employee, { foreignKey: 'employeeId', as: 'employee' });

// Branch <-> ExtraStock <-> Extra (tồn kho riêng theo từng chi nhánh)
db.Branch.hasMany(db.ExtraStock, { foreignKey: 'branchId', as: 'extraStocks' });
db.ExtraStock.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Extra.hasMany(db.ExtraStock, { foreignKey: 'extraId', as: 'stocks' });
db.ExtraStock.belongsTo(db.Extra, { foreignKey: 'extraId', as: 'extra' });

// Stock movements (sổ nhật ký kho)
db.Branch.hasMany(db.StockMovement, { foreignKey: 'branchId', as: 'stockMovements' });
db.StockMovement.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Extra.hasMany(db.StockMovement, { foreignKey: 'extraId', as: 'stockMovements' });
db.StockMovement.belongsTo(db.Extra, { foreignKey: 'extraId', as: 'extra' });
db.User.hasMany(db.StockMovement, { foreignKey: 'actorUserId', as: 'stockMovements' });
db.StockMovement.belongsTo(db.User, { foreignKey: 'actorUserId', as: 'actor' });

// Goods receipts (phiếu nhập kho)
db.Branch.hasMany(db.GoodsReceipt, { foreignKey: 'branchId', as: 'goodsReceipts' });
db.GoodsReceipt.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Supplier.hasMany(db.GoodsReceipt, { foreignKey: 'supplierId', as: 'goodsReceipts' });
db.GoodsReceipt.belongsTo(db.Supplier, { foreignKey: 'supplierId', as: 'supplier' });
db.User.hasMany(db.GoodsReceipt, { foreignKey: 'receivedByUserId', as: 'goodsReceipts' });
db.GoodsReceipt.belongsTo(db.User, { foreignKey: 'receivedByUserId', as: 'receivedBy' });

db.GoodsReceipt.hasMany(db.GoodsReceiptItem, { foreignKey: 'goodsReceiptId', as: 'items' });
db.GoodsReceiptItem.belongsTo(db.GoodsReceipt, { foreignKey: 'goodsReceiptId', as: 'goodsReceipt' });
db.Extra.hasMany(db.GoodsReceiptItem, { foreignKey: 'extraId', as: 'goodsReceiptItems' });
db.GoodsReceiptItem.belongsTo(db.Extra, { foreignKey: 'extraId', as: 'extra' });

// Catalog bán lẻ — dùng chung toàn chuỗi (không có branch_id)
db.ProductCategory.hasMany(db.Product, { foreignKey: 'categoryId', as: 'products' });
db.Product.belongsTo(db.ProductCategory, { foreignKey: 'categoryId', as: 'category' });
db.Product.hasMany(db.ProductVariant, { foreignKey: 'productId', as: 'variants' });
db.ProductVariant.belongsTo(db.Product, { foreignKey: 'productId', as: 'product' });

// Tồn kho sản phẩm bán lẻ — theo từng chi nhánh (khác catalog dùng chung)
db.Branch.hasMany(db.ProductStock, { foreignKey: 'branchId', as: 'productStocks' });
db.ProductStock.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.ProductVariant.hasMany(db.ProductStock, { foreignKey: 'productVariantId', as: 'stocks' });
db.ProductStock.belongsTo(db.ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });

// Ledger kho dùng chung (stock_movements/goods_receipt_items) — nhánh product_variant
db.ProductVariant.hasMany(db.StockMovement, { foreignKey: 'productVariantId', as: 'stockMovements' });
db.StockMovement.belongsTo(db.ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });
db.ProductVariant.hasMany(db.GoodsReceiptItem, { foreignKey: 'productVariantId', as: 'goodsReceiptItems' });
db.GoodsReceiptItem.belongsTo(db.ProductVariant, { foreignKey: 'productVariantId', as: 'variant' });

// Đơn bán lẻ (sales_orders) — kênh POS, độc lập luồng sân
db.Branch.hasMany(db.SalesOrder, { foreignKey: 'branchId', as: 'salesOrders' });
db.SalesOrder.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });
db.Customer.hasMany(db.SalesOrder, { foreignKey: 'customerId', as: 'salesOrders' });
db.SalesOrder.belongsTo(db.Customer, { foreignKey: 'customerId', as: 'customer' });
db.Employee.hasMany(db.SalesOrder, { foreignKey: 'cashierEmployeeId', as: 'salesOrders' });
db.SalesOrder.belongsTo(db.Employee, { foreignKey: 'cashierEmployeeId', as: 'cashier' });
db.SalesOrder.hasMany(db.SalesOrderLine, { foreignKey: 'salesOrderId', as: 'lines', onDelete: 'CASCADE' });
db.SalesOrderLine.belongsTo(db.SalesOrder, { foreignKey: 'salesOrderId', as: 'salesOrder' });
db.ProductVariant.hasMany(db.SalesOrderLine, { foreignKey: 'variantId', as: 'salesOrderLines' });
db.SalesOrderLine.belongsTo(db.ProductVariant, { foreignKey: 'variantId', as: 'variant' });

// Invoice <-> SalesOrder (checkout bán lẻ, độc lập checkout sân)
db.SalesOrder.hasOne(db.Invoice, { foreignKey: 'salesOrderId', as: 'invoice' });
db.Invoice.belongsTo(db.SalesOrder, { foreignKey: 'salesOrderId', as: 'salesOrder' });

// Employee <-> ActivityLog
db.Employee.hasMany(db.ActivityLog, { foreignKey: 'employeeId', as: 'activityLogs' });
db.ActivityLog.belongsTo(db.Employee, { foreignKey: 'employeeId', as: 'employee' });
db.ActivityLog.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
db.ActivityLog.belongsTo(db.Branch, { foreignKey: 'branchId', as: 'branch' });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
