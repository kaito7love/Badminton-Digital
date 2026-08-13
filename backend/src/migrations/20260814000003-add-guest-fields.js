'use strict';

/**
 * Frontend already collects a walk-in player name on "Mở sân" (Courts) and a
 * walk-in customer name/phone on "Tạo booking" (Bookings), but the backend had
 * nowhere to store them — Customer.phone is NOT NULL + UNIQUE, so a walk-in
 * without a phone can't be turned into a Customer record. These columns give
 * the frontend fields a real home without forcing every walk-in through full
 * customer registration.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('court_sessions', 'player_name', {
      type: Sequelize.STRING(100),
      allowNull: true
    });

    await queryInterface.addColumn('bookings', 'customer_name', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    await queryInterface.addColumn('bookings', 'customer_phone', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('bookings', 'customer_phone');
    await queryInterface.removeColumn('bookings', 'customer_name');
    await queryInterface.removeColumn('court_sessions', 'player_name');
  }
};
