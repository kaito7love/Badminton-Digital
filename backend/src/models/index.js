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
db.Payment = require('./Payment')(sequelize);
db.Setting = require('./Setting')(sequelize);
db.ActivityLog = require('./ActivityLog')(sequelize);

// Associations
// Role <-> User
db.Role.hasMany(db.User, { foreignKey: 'roleId', as: 'users' });
db.User.belongsTo(db.Role, { foreignKey: 'roleId', as: 'role' });

// User <-> Employee (1-1)
db.User.hasOne(db.Employee, { foreignKey: 'userId', as: 'employee' });
db.Employee.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

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

// Employee <-> Payment
db.Employee.hasMany(db.Payment, { foreignKey: 'employeeId', as: 'payments' });
db.Payment.belongsTo(db.Employee, { foreignKey: 'employeeId', as: 'employee' });

// Employee <-> ActivityLog
db.Employee.hasMany(db.ActivityLog, { foreignKey: 'employeeId', as: 'activityLogs' });
db.ActivityLog.belongsTo(db.Employee, { foreignKey: 'employeeId', as: 'employee' });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
