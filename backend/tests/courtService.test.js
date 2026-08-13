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
});
