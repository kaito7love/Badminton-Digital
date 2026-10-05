import React from 'react';
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionDot, EmptyState, Notice, StatusBadge, TeamNames, UpdateBanner, Button } from './ui';
import { CompetitionError } from '../lib/errors';

// Vitest chạy môi trường node (không jsdom) — kiểm cấu trúc HTML bằng render phía máy chủ.
const html = (el) => renderToStaticMarkup(el);

describe('thành phần dùng chung', () => {
  test('StatusBadge: nhãn tiếng Việt cho giải / trận / buổi; trạng thái lạ giữ nguyên chữ', () => {
    expect(html(<StatusBadge status="in_progress" />)).toContain('Đang đấu');
    expect(html(<StatusBadge status="completed" kind="match" />)).toContain('Đã xong');
    expect(html(<StatusBadge status="open" kind="session" />)).toContain('Đang diễn ra');
    expect(html(<StatusBadge status="lạ" />)).toContain('lạ');
  });

  test('TeamNames: đơn, đôi, chưa xác định', () => {
    expect(html(<TeamNames team={{ players: [{ name: 'An' }] }} />)).toContain('An');
    expect(html(<TeamNames team={{ players: [{ name: 'An' }, { name: 'Bình' }] }} />)).toContain('An + Bình');
    expect(html(<TeamNames team={null} />)).toContain('chờ xác định');
  });

  test('Notice lỗi: câu dễ hiểu + mã lỗi nhỏ, role=alert; thông báo thường role=status', () => {
    const error = new CompetitionError({ message: 'Máy khác vừa bấm điểm trận này.', code: 'LIVE_CONFLICT', fields: [] });
    const markup = html(<Notice error={error} onRetry={() => {}} />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Máy khác vừa bấm điểm trận này.');
    expect(markup).toContain('LIVE_CONFLICT');
    expect(markup).toContain('Thử lại');
    expect(html(<Notice kind="info">Xin chào</Notice>)).toContain('role="status"');
  });

  test('Notice không in mã NETWORK (vô nghĩa với người dùng)', () => {
    const error = new CompetitionError({ message: 'Không kết nối được máy chủ.', code: 'NETWORK', fields: [] });
    expect(html(<Notice error={error} />)).not.toContain('NETWORK');
  });

  test('UpdateBanner có nút Tải lại', () => {
    expect(html(<UpdateBanner onReload={() => {}} />)).toContain('Tải lại');
  });

  test('ConnectionDot: trực tiếp / đang nối lại; trạng thái rảnh không vẽ gì', () => {
    expect(html(<ConnectionDot status="live" />)).toContain('Trực tiếp');
    expect(html(<ConnectionDot status="reconnecting" />)).toContain('đang nối lại');
    expect(html(<ConnectionDot status="idle" />)).toBe('');
  });

  test('Button khoá khi busy (chặn bấm đúp)', () => {
    expect(html(<Button busy>Lưu</Button>)).toContain('disabled=""');
    expect(html(<Button>Lưu</Button>)).not.toContain('disabled=""');
  });

  test('EmptyState', () => {
    expect(html(<EmptyState title="Chưa có giải">Tạo giải đầu tiên</EmptyState>)).toContain('Chưa có giải');
  });
});
