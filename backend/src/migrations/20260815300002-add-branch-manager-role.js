'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('roles', [
      {
        name: 'branch_manager',
        description: 'Quản lý vận hành trong phạm vi 1 chi nhánh',
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', { name: 'branch_manager' }, {});
  }
};
