'use strict';

/**
 * M1's changeColumn(table, 'branch_id', { allowNull: false, references: {...} })
 * calls never actually applied NOT NULL on MySQL — Sequelize's query generator
 * treats a changeColumn with `references` as "add another FK", not "MODIFY COLUMN",
 * so branch_id was left nullable on every branch-scoped table despite the model
 * declaring `allowNull: false`. This migration enforces it for real via raw SQL.
 */
const branchTables = [
  'courts',
  'bookings',
  'court_sessions',
  'customers',
  'employees',
  'invoices',
  'payments'
];

module.exports = {
  async up(queryInterface) {
    for (const table of branchTables) {
      await queryInterface.sequelize.query(
        `UPDATE \`${table}\` SET branch_id = 1 WHERE branch_id IS NULL`
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE \`${table}\` MODIFY \`branch_id\` INT NOT NULL`
      );
    }
  },

  async down(queryInterface) {
    for (const table of branchTables) {
      await queryInterface.sequelize.query(
        `ALTER TABLE \`${table}\` MODIFY \`branch_id\` INT NULL`
      );
    }
  }
};
