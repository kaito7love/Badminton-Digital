const { BranchDocumentSequence } = require('../models');

const nextInvoiceNumber = async (branchId, transaction) => {
  const sequence = await BranchDocumentSequence.findOne({
    where: { branchId, documentType: 'invoice' },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!sequence) {
    const error = new Error('Chưa cấu hình sequence hóa đơn cho chi nhánh.');
    error.statusCode = 500;
    throw error;
  }

  const currentValue = Number(sequence.nextValue);
  await sequence.update({ nextValue: currentValue + 1 }, { transaction });
  return `BD-${branchId}-${String(currentValue).padStart(8, '0')}`;
};

module.exports = { nextInvoiceNumber };
