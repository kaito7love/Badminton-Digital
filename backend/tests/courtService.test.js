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
