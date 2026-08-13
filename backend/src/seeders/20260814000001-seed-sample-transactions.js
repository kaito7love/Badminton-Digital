'use strict';

const { calculateCourtFee, calculateInvoiceTotals } = require('../utils/priceCalculator');

/**
 * Sample transactional data so a fresh install has something to look at:
 * bookings, completed court sessions (+ extras + invoices + payments) for
 * the last few days, and one currently-playing session. Without this,
 * Dashboard/Reports/History/Bookings render correctly but permanently empty
 * on a brand new database, which makes it impossible to tell "loads from DB
 * but empty" apart from "doesn't actually load from DB".
 */

const COURT_RATES = {
  1: { peak: 90000, offpeak: 60000 },
  2: { peak: 90000, offpeak: 60000 },
  3: { peak: 90000, offpeak: 60000 },
  4: { peak: 140000, offpeak: 100000 }
};

const EXTRA_PRICES = {
  1: 25000, // Cầu lông Yonex King
  2: 30000, // Thuê vợt
  3: 10000, // Nước suối
  4: 15000  // Nước điện giải
};

const atHour = (daysAgo, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
};

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // Two more registered customers, in addition to the ones from the initial seed
    await queryInterface.bulkInsert('customers', [
      {
        branch_id: 1,
        user_id: null,
        full_name: 'Trần Thị Mai',
        phone: '0911222333',
        email: null,
        total_spent: 0.0,
        loyalty_tier: 'normal',
        created_at: now,
        updated_at: now
      },
      {
        branch_id: 1,
        user_id: null,
        full_name: 'Lê Hoàng Nam',
        phone: '0922333444',
        email: null,
        total_spent: 0.0,
        loyalty_tier: 'normal',
        created_at: now,
        updated_at: now
      }
    ]);
    const [customerRows] = await queryInterface.sequelize.query(
      `SELECT id FROM customers ORDER BY id`
    );
    const customerIds = customerRows.map((r) => r.id); // [1,2,3,4]

    // Historical completed sessions: courtId, daysAgo, startHour, durationHours, customerId (null = guest), employeeId, extras[], discountAmount
    const plan = [
      { courtId: 1, daysAgo: 5, startHour: 8, hours: 1.5, customerId: customerIds[0], employeeId: 2, extras: [{ extraId: 3, qty: 2 }], discount: 0 },
      { courtId: 2, daysAgo: 5, startHour: 18, hours: 1, customerId: customerIds[2], employeeId: 2, extras: [{ extraId: 1, qty: 1 }], discount: 0 },
      { courtId: 4, daysAgo: 4, startHour: 19, hours: 2, customerId: customerIds[1], employeeId: 1, extras: [{ extraId: 4, qty: 2 }, { extraId: 2, qty: 1 }], discount: 20000 },
      { courtId: 3, daysAgo: 3, startHour: 9, hours: 1, customerId: null, employeeId: 2, extras: [], discount: 0 },
      { courtId: 1, daysAgo: 3, startHour: 17, hours: 1.5, customerId: customerIds[3], employeeId: 2, extras: [{ extraId: 3, qty: 1 }], discount: 0 },
      { courtId: 2, daysAgo: 2, startHour: 7, hours: 1, customerId: customerIds[0], employeeId: 1, extras: [{ extraId: 1, qty: 2 }], discount: 0 },
      { courtId: 4, daysAgo: 2, startHour: 20, hours: 1, customerId: customerIds[2], employeeId: 2, extras: [], discount: 0 },
      { courtId: 3, daysAgo: 1, startHour: 18, hours: 1.5, customerId: customerIds[1], employeeId: 2, extras: [{ extraId: 3, qty: 2 }, { extraId: 4, qty: 1 }], discount: 10000 },
      { courtId: 1, daysAgo: 1, startHour: 6, hours: 1, customerId: null, employeeId: 1, extras: [], discount: 0 }
    ];

    const customerSpend = new Map();
    let invoiceSeq = 1;

    for (const item of plan) {
      const startTime = atHour(item.daysAgo, item.startHour);
      const endTime = new Date(startTime.getTime() + item.hours * 3600 * 1000);
      const rates = COURT_RATES[item.courtId];
      const { durationSeconds, courtFee } = calculateCourtFee(startTime, endTime, rates.peak, rates.offpeak);

      await queryInterface.bulkInsert('court_sessions', [
        {
          branch_id: 1,
          court_id: item.courtId,
          booking_id: null,
          customer_id: item.customerId,
          player_name: item.customerId ? null : 'Khách vãng lai',
          employee_id: item.employeeId,
          start_time: startTime,
          end_time: endTime,
          duration_seconds: durationSeconds,
          court_fee: courtFee,
          status: 'closed',
          created_at: startTime,
          updated_at: endTime
        }
      ]);
      const [[{ id: sessionId }]] = await queryInterface.sequelize.query(`SELECT LAST_INSERT_ID() AS id`);

      const sessionExtras = [];
      for (const ex of item.extras) {
        const unitPrice = EXTRA_PRICES[ex.extraId];
        const subtotal = unitPrice * ex.qty;
        await queryInterface.bulkInsert('session_extras', [
          {
            session_id: sessionId,
            extra_id: ex.extraId,
            quantity: ex.qty,
            unit_price: unitPrice,
            subtotal,
            created_at: startTime,
            updated_at: endTime
          }
        ]);
        sessionExtras.push({ quantity: ex.qty, unitPrice });
      }

      const totals = calculateInvoiceTotals(courtFee, sessionExtras, item.discount, false);
      const invoiceNo = `BD-1-${String(invoiceSeq).padStart(8, '0')}`;
      invoiceSeq += 1;

      await queryInterface.bulkInsert('invoices', [
        {
          branch_id: 1,
          invoice_no: invoiceNo,
          status: 'paid',
          sales_order_id: null,
          session_id: sessionId,
          court_fee: totals.courtFee,
          extras_fee: totals.extrasFee,
          discount_amount: totals.discountAmount,
          total_amount: totals.totalAmount,
          created_at: endTime,
          updated_at: endTime
        }
      ]);
      const [[{ id: invoiceId }]] = await queryInterface.sequelize.query(`SELECT LAST_INSERT_ID() AS id`);

      const paymentMethod = item.discount > 0 ? 'transfer' : 'cash';
      await queryInterface.bulkInsert('payments', [
        {
          branch_id: 1,
          invoice_id: invoiceId,
          method: paymentMethod,
          status: 'paid',
          paid_at: endTime,
          employee_id: item.employeeId,
          idempotency_key: `seed-session-${sessionId}`,
          amount: totals.totalAmount,
          currency: 'VND',
          confirmed_at: endTime,
          created_at: endTime,
          updated_at: endTime
        }
      ]);

      if (item.customerId) {
        customerSpend.set(item.customerId, (customerSpend.get(item.customerId) || 0) + totals.totalAmount);
      }
    }

    for (const [customerId, spent] of customerSpend.entries()) {
      const loyaltyTier = spent >= 15000000 ? 'gold' : spent >= 5000000 ? 'silver' : 'normal';
      await queryInterface.sequelize.query(
        `UPDATE customers SET total_spent = total_spent + :spent, loyalty_tier = :tier WHERE id = :id`,
        { replacements: { spent, tier: loyaltyTier, id: customerId } }
      );
    }

    await queryInterface.sequelize.query(
      `UPDATE branch_document_sequences SET next_value = :next WHERE branch_id = 1 AND document_type = 'invoice' AND next_value < :next`,
      { replacements: { next: invoiceSeq } }
    );

    // One currently-playing session so the Courts page shows a live court on first load
    const liveStart = new Date(now.getTime() - 25 * 60 * 1000);
    await queryInterface.bulkInsert('court_sessions', [
      {
        branch_id: 1,
        court_id: 2,
        booking_id: null,
        customer_id: customerIds[0],
        player_name: null,
        employee_id: 2,
        start_time: liveStart,
        end_time: null,
        duration_seconds: null,
        court_fee: null,
        status: 'playing',
        created_at: liveStart,
        updated_at: liveStart
      }
    ]);

    // A few upcoming bookings: mix of registered customers and walk-in guests
    const tomorrow = atHour(-1, 0, 0);
    const bookingDate = tomorrow.toISOString().slice(0, 10);
    await queryInterface.bulkInsert('bookings', [
      {
        branch_id: 1,
        court_id: 1,
        customer_id: customerIds[3],
        customer_name: null,
        customer_phone: null,
        booking_date: bookingDate,
        start_time: '18:00:00',
        end_time: '19:30:00',
        status: 'confirmed',
        created_by: 2,
        created_at: now,
        updated_at: now
      },
      {
        branch_id: 1,
        court_id: 3,
        customer_id: null,
        customer_name: 'Phạm Quốc Bảo',
        customer_phone: '0933444555',
        booking_date: bookingDate,
        start_time: '20:00:00',
        end_time: '21:00:00',
        status: 'pending',
        created_by: 2,
        created_at: now,
        updated_at: now
      },
      {
        branch_id: 1,
        court_id: 4,
        customer_id: customerIds[1],
        customer_name: null,
        customer_phone: null,
        booking_date: bookingDate,
        start_time: '07:00:00',
        end_time: '08:00:00',
        status: 'pending',
        created_by: 1,
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM bookings WHERE booking_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)`);
    await queryInterface.sequelize.query(`DELETE FROM payments WHERE idempotency_key LIKE 'seed-session-%'`);
    await queryInterface.sequelize.query(`DELETE FROM invoices WHERE invoice_no LIKE 'BD-1-%'`);
    await queryInterface.sequelize.query(`DELETE FROM session_extras`);
    await queryInterface.sequelize.query(`DELETE FROM court_sessions`);
    await queryInterface.bulkDelete('customers', { full_name: ['Trần Thị Mai', 'Lê Hoàng Nam'] }, {});
  }
};
