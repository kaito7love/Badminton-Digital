'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bookings', 'guest_name', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    await queryInterface.addColumn('bookings', 'guest_phone', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
    await queryInterface.addColumn('court_sessions', 'guest_name', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('bookings', 'guest_name');
    await queryInterface.removeColumn('bookings', 'guest_phone');
    await queryInterface.removeColumn('court_sessions', 'guest_name');
  }
};
