const InventoryService = require('../src/services/InventoryService');
const { StockMovement } = require('../src/models');

describe('InventoryService Unit Tests', () => {
  describe('computeAverageCost', () => {
    test('uses the incoming unit cost when there is no prior stock', () => {
      const result = InventoryService.computeAverageCost(0, null, 10, 5000);
      expect(result).toBe(5000);
    });

    test('computes weighted average across old and new stock', () => {
      // 10 cái giá vốn 5000 + 10 cái giá vốn 7000 => bình quân 6000
      const result = InventoryService.computeAverageCost(10, 5000, 10, 7000);
      expect(result).toBe(6000);
    });

    test('weights larger batches more heavily', () => {
      // 5 cái giá 4000 + 15 cái giá 8000 => (20000 + 120000) / 20 = 7000
      const result = InventoryService.computeAverageCost(5, 4000, 15, 8000);
      expect(result).toBe(7000);
    });
  });

  describe('movement type taxonomy', () => {
    test('every movement type is classified as either incoming or outgoing, never both', () => {
      for (const type of StockMovement.MOVEMENT_TYPES) {
        const isIncoming = StockMovement.INCOMING_TYPES.includes(type);
        const isOutgoing = StockMovement.OUTGOING_TYPES.includes(type);
        expect(isIncoming !== isOutgoing).toBe(true);
      }
    });

    test('sale and adjustment_out reduce stock, purchase_receipt and sale_return increase it', () => {
      expect(StockMovement.OUTGOING_TYPES).toEqual(expect.arrayContaining(['sale', 'adjustment_out', 'damaged', 'lost']));
      expect(StockMovement.INCOMING_TYPES).toEqual(expect.arrayContaining(['purchase_receipt', 'sale_return', 'opening_balance', 'adjustment_in']));
    });
  });

  describe('postMovement guard clauses', () => {
    test('rejects a call without an active transaction', async () => {
      await expect(InventoryService.postMovement({
        branchId: 1, extraId: 1, type: 'sale', quantity: 1, transaction: undefined
      })).rejects.toThrow('requires an active transaction');
    });

    test('rejects a non-positive quantity', async () => {
      const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
      await expect(InventoryService.postMovement({
        branchId: 1, extraId: 1, type: 'sale', quantity: 0, transaction: fakeTransaction
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    test('rejects an unknown movement type', async () => {
      const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
      await expect(InventoryService.postMovement({
        branchId: 1, extraId: 1, type: 'teleport', quantity: 1, transaction: fakeTransaction
      })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('createManualAdjustment guard clauses', () => {
    test('rejects an adjustment type outside the manual-adjustment whitelist', async () => {
      await expect(InventoryService.createManualAdjustment({
        branchId: 1, extraId: 1, type: 'sale', quantity: 1, note: 'test'
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    test('rejects a missing reason (note)', async () => {
      await expect(InventoryService.createManualAdjustment({
        branchId: 1, extraId: 1, type: 'damaged', quantity: 1, note: '  '
      })).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
