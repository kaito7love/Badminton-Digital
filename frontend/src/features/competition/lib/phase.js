import { isPairsTournament } from './labels';

// Giai đoạn của giải → bước trên thanh tiến trình, một câu "việc cần làm" và một nút chính (07 mục 2, bài học bấm thử plan 20).
// `todo` là chuỗi có thể chứa **chữ đậm** — giao diện tách bằng `splitBold`.

export const splitBold = (text) => String(text || '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => (
  part.startsWith('**') ? { bold: true, text: part.slice(2, -2) } : { bold: false, text: part }
));

export const stepsOf = (t) => [
  'Đăng ký',
  'Điểm danh',
  'Bốc thăm',
  t.format === 'groups_knockout' ? 'Vòng bảng' : 'Thi đấu',
  ...(t.format === 'groups_knockout' ? ['Loại trực tiếp'] : []),
  'Chốt'
];

/**
 * @param t giải; @param ms các trận; @param es các đăng ký (entries).
 * @returns { steps, step, todo, primary: {id,label}|null, secondary?: {id,label} }
 *   id: 'open' | 'draw' | 'ko' | 'fin' | 'goto:<tab>'
 */
export const phaseOf = (t, ms, es) => {
  const steps = stepsOf(t);
  const last = steps.length - 1;
  const active = es.filter((e) => e.status !== 'withdrawn');
  const registered = active.filter((e) => e.status === 'registered');
  const pairs = isPairsTournament(t);
  const unit = pairs ? 'cặp' : 'người';
  const units = pairs ? Math.floor(registered.length / 2) : registered.length;
  const checked = registered.filter((e) => e.checkedInAt).length;
  const open = ms.filter((m) => m.status === 'scheduled' || m.status === 'in_play');
  const playing = ms.filter((m) => m.status === 'in_play').length;
  const groupLeft = ms.filter((m) => m.stage === 'group' && (m.status === 'scheduled' || m.status === 'in_play')).length;
  const enough = t.discipline === 'singles' ? registered.length >= 2 : registered.length >= 4;

  if (t.status === 'cancelled') return { steps, step: -1, todo: 'Giải đã huỷ.', primary: null };
  if (t.status === 'draft') {
    return { steps, step: 0, todo: 'Giải đang là **nháp**. Mở đăng ký để bắt đầu nhận đăng ký.', primary: { id: 'open', label: 'Mở đăng ký' } };
  }
  if (t.status === 'open') {
    if (!enough) {
      return { steps, step: 0, todo: `Đăng ký các ${unit} — đang có **${units} ${unit}**.`, primary: { id: 'goto:dangky', label: pairs ? 'Đăng ký cặp' : 'Đăng ký người chơi' } };
    }
    if (t.checkInRequired) {
      return {
        steps,
        step: checked ? 1 : 0,
        todo: `${units} ${unit} đã đăng ký. **Ngày thi đấu:** điểm danh khi mọi người đến (**${checked}/${registered.length}** người đã đến), rồi bốc thăm — ai chưa đến sang danh sách chờ.`,
        primary: { id: 'draw', label: 'Bốc thăm…' },
        secondary: { id: 'goto:dangky', label: 'Điểm danh' }
      };
    }
    return {
      steps,
      step: 2,
      todo: `${units} ${unit} đã đăng ký. Đủ người thì bốc thăm (có thể bốc trước ngày thi đấu).`,
      primary: { id: 'draw', label: 'Bốc thăm…' },
      secondary: { id: 'goto:dangky', label: 'Đăng ký thêm' }
    };
  }
  if (t.status === 'finalized') {
    return { steps, step: last + 1, todo: 'Giải đã chốt — thứ hạng, điểm trình, BXH đã cập nhật.', primary: { id: 'goto:ketqua', label: 'Xem kết quả' } };
  }

  // drawn / in_progress
  if (t.format === 'groups_knockout' && t.stage === 'group') {
    if (!groupLeft) {
      return { steps, step: 4, todo: 'Vòng bảng đã xong — xem và khoá sơ đồ loại trực tiếp.', primary: { id: 'ko', label: 'Sơ đồ loại trực tiếp…' } };
    }
    return {
      steps,
      step: 3,
      todo: `Vòng bảng: còn **${groupLeft} trận**${playing ? ` (${playing} đang đánh)` : ''}. Gọi trận ra sân ở tab **Sân**; nhập tỉ số ở sân hoặc tab Lịch.`,
      primary: { id: 'goto:san', label: 'Mở tab Sân' }
    };
  }
  if (!open.length) {
    return { steps, step: last, todo: 'Mọi trận đã xong — xem trước rồi chốt giải.', primary: { id: 'fin', label: 'Chốt giải…' } };
  }
  const step = t.format === 'groups_knockout' ? 4 : 3;
  const label = t.stage === 'knockout' && t.format === 'groups_knockout' ? 'Loại trực tiếp' : 'Thi đấu';
  return {
    steps,
    step,
    todo: `${label}: còn **${open.length} trận**${playing ? ` (${playing} đang đánh)` : ''}. Gọi trận ra sân ở tab **Sân**.`,
    primary: { id: 'goto:san', label: 'Mở tab Sân' }
  };
};
