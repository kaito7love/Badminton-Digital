const { BranchDocumentSequence } = require('../models');

const PREFIXES = {
  invoice: 'BD',
  goods_receipt: 'GR'
};

const nextDocumentNumber = async (branchId, documentType, transaction) => {
  const sequence = await BranchDocumentSequence.findOne({
    where: { branchId, documentType },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!sequence) {
    const error = new Error(`Chưa cấu hình sequence '${documentType}' cho chi nhánh.`);
    error.statusCode = 500;
    throw error;
  }

  const currentValue = Number(sequence.nextValue);
  await sequence.update({ nextValue: currentValue + 1 }, { transaction });
  return `${PREFIXES[documentType] || documentType.toUpperCase()}-${branchId}-${String(currentValue).padStart(8, '0')}`;
};

const nextInvoiceNumber = (branchId, transaction) => nextDocumentNumber(branchId, 'invoice', transaction);
const nextGoodsReceiptCode = (branchId, transaction) => nextDocumentNumber(branchId, 'goods_receipt', transaction);

module.exports = { nextDocumentNumber, nextInvoiceNumber, nextGoodsReceiptCode };
