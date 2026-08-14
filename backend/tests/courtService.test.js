const CourtService = require('../src/services/CourtService');

describe('CourtService Unit Tests', () => {
  test('should format court with AVAILABLE state when active and no active session', () => {
    const courtData = {
      id: 1,
      name: 'Sân 01',
      status: 'active',
      sessions: []
    };
    const formatted = CourtService.formatCourt(courtData);
    expect(formatted.state).toBe('AVAILABLE');
  });

  test('should format court with PLAYING state when active session exists', () => {
    const courtData = {
      id: 1,
      name: 'Sân 01',
      status: 'active',
      sessions: [{ id: 10, status: 'playing' }]
    };
    const formatted = CourtService.formatCourt(courtData);
    expect(formatted.state).toBe('PLAYING');
  });

  test('should format court with MAINTENANCE state when status is maintenance', () => {
    const courtData = {
      id: 1,
      name: 'Sân 01',
      status: 'maintenance',
      sessions: []
    };
    const formatted = CourtService.formatCourt(courtData);
    expect(formatted.state).toBe('MAINTENANCE');
  });

  test('should format court with INACTIVE state when court is retired from service', () => {
    const courtData = {
      id: 1,
      name: 'Sân 01',
      status: 'inactive',
      sessions: []
    };
    const formatted = CourtService.formatCourt(courtData);
    expect(formatted.state).toBe('INACTIVE');
  });

  // Vòng đời sân và việc có người chơi là hai trục độc lập: sân ngưng khai thác
  // thì dù dữ liệu còn sót phiên mở cũng không được hiện là "đang chơi".
  test('should keep lifecycle status ahead of occupancy when both are present', () => {
    const courtData = {
      id: 1,
      name: 'Sân 01',
      status: 'inactive',
      sessions: [{ id: 10, status: 'playing' }]
    };
    const formatted = CourtService.formatCourt(courtData);
    expect(formatted.state).toBe('INACTIVE');
  });
});

describe('CourtService — bảng chuyển đổi trạng thái', () => {
  test.each([
    ['active', 'maintenance', 'court.maintenance_started'],
    ['active', 'inactive', 'court.retired'],
    ['maintenance', 'active', 'court.maintenance_completed'],
    ['maintenance', 'inactive', 'court.retired'],
    ['inactive', 'active', 'court.reactivated']
  ])('cho phép %s -> %s và đặt tên hành động là %s', (from, to, action) => {
    expect(CourtService.resolveStatusTransition(from, to)).toBe(action);
  });

  // Sân đã ngưng khai thác thì không có gì để bảo trì — phải khai thác trở lại trước
  test('chặn inactive -> maintenance', () => {
    expect(CourtService.resolveStatusTransition('inactive', 'maintenance')).toBeNull();
  });

  test('chặn chuyển sang chính trạng thái đang có', () => {
    ['active', 'maintenance', 'inactive'].forEach((s) => {
      expect(CourtService.resolveStatusTransition(s, s)).toBeNull();
    });
  });
});

describe('CourtService — lọc trường được sửa', () => {
  // Đổ thẳng req.body vào update() từng cho phép đổi cả status (đi vòng qua mọi
  // kiểm tra) lẫn branchId (chuyển sân sang chi nhánh khác)
  test('bỏ qua status và branchId, chỉ giữ thông tin mô tả sân', () => {
    const picked = CourtService.pickEditableFields({
      name: 'Sân 01',
      peakPricePerHour: 120000,
      status: 'inactive',
      branchId: 99,
      version: 5
    });
    expect(picked).toEqual({ name: 'Sân 01', peakPricePerHour: 120000 });
  });
});
