const path = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// server.js tự listen + đặt setInterval; PORT=0 để lấy cổng ngẫu nhiên, jest chạy với --forceExit.
const app = require('../src/server');
const { sequelize, User } = require('../src/models');

const api = () => request(app);

// Token ký đúng như AuthService (cùng secret) — không dùng /login để khỏi chạm limiter 10 lần/15 phút/IP.
const tokenFor = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });

// Tài khoản mẫu của seeder (đúng thứ tự id trong DB vừa seed).
const DEMO = {
  admin: { id: 1, email: 'admin@badminton.com', role: 'admin' },
  employeeCn1: { id: 2, email: 'employee@badminton.com', role: 'employee' },
  customer: { id: 3, email: 'customer@badminton.com', role: 'customer' },
  employeeCn2: { id: 4, email: 'employee.q3@badminton.com', role: 'employee' },
  employeeCn3: { id: 5, email: 'employee.q7@badminton.com', role: 'employee' },
  managerCn2: { id: 6, email: 'manager.q3@badminton.com', role: 'branch_manager' }
};
const bearer = (who) => `Bearer ${tokenFor(DEMO[who])}`;

const registerCustomer = async (phone, password = 'Cam-Bien-Gio-2026') => {
  const res = await api().post('/api/v1/auth/register').send({ phone, fullName: `SecTest ${phone}`, password });
  if (res.status !== 201) throw new Error(`register ${phone}: ${res.status} ${JSON.stringify(res.body)}`);
  const user = await User.findOne({ where: { phone } });
  return { id: user.id, email: user.email, role: 'customer', phone, password };
};

let counter = 0;
const unique = () => `09${String(Date.now()).slice(-7)}${counter++ % 10}`.slice(0, 11);

module.exports = { app, api, sequelize, tokenFor, bearer, DEMO, registerCustomer, unique };
