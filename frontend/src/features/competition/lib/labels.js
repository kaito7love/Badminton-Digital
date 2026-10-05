// Nhãn tiếng Việt cho các giá trị enum của service — một chỗ, để mọi màn hình nói cùng một thứ tiếng.

export const TOURNAMENT_STATUS = {
  draft: ['Nháp', 'slate'],
  open: ['Đang mở đăng ký', 'emerald'],
  closed: ['Đã đóng', 'slate'],
  drawn: ['Đã bốc thăm', 'sky'],
  in_progress: ['Đang đấu', 'amber'],
  finalized: ['Đã chốt', 'emerald'],
  cancelled: ['Đã huỷ', 'rose']
};

export const MATCH_STATUS = {
  scheduled: ['Chưa đánh', 'slate'],
  in_play: ['Đang đánh', 'amber'],
  completed: ['Đã xong', 'emerald'],
  ended: ['Xong, không tỉ số', 'slate'],
  cancelled: ['Đã huỷ', 'rose']
};

export const SESSION_STATUS = {
  open: ['Đang diễn ra', 'emerald'],
  closed: ['Đã đóng', 'slate'],
  cancelled: ['Đã huỷ', 'rose']
};

export const OUTCOME = { walkover: 'W.O.', retired: 'bỏ cuộc' };
export const FORMAT = { round_robin: 'vòng tròn', groups_knockout: 'vòng bảng + loại trực tiếp', knockout: 'loại trực tiếp' };
export const GENDER = { open: 'tự do', men: 'nam', women: 'nữ', mixed: 'nam nữ' };
export const PAIRING = { fixed: 'cặp đăng ký sẵn', random_balanced: 'bốc thăm ghép cặp cân bằng' };
export const MODE = { balanced: 'cân bằng', level: 'cùng trình', random: 'ngẫu nhiên' };

/** Luật điểm: chọn theo buổi / giải (plan 19 mục 10). */
export const SCORING_PRESETS = [
  ['1x21', '1 game × 21 điểm (mặc định)'],
  ['3x21', '3 game × 21 điểm (bo3)'],
  ['3x15', '3 game × 15 điểm (bo3)'],
  ['1x31', '1 game × 31 điểm']
];
export const MATCH_MINUTES = { '1x21': 15, '3x21': 35, '3x15': 25, '1x31': 20 };
export const presetOf = (scoring) => (scoring ? `${scoring.bestOf}x${scoring.points}` : '1x21');

/** Nhãn "chấm nhanh" khi người chơi chưa có điểm trình. */
export const QUICK_LEVELS = [
  ['beginner', 'Mới chơi (1.5)'],
  ['weak', 'Yếu (2.25)'],
  ['tb_minus', 'TB- (2.75)'],
  ['tb', 'TB (3.25)'],
  ['tb_plus', 'TB+ (3.75)'],
  ['kha', 'Khá (4.25)']
];

export const isPairsTournament = (t) => t.discipline === 'doubles' && t.pairingMode === 'fixed';
export const disciplineText = (t) => `${t.discipline === 'doubles' ? 'Đôi' : 'Đơn'} ${GENDER[t.genderRule] || ''}`.trim();
