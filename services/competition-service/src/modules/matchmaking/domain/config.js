// Hằng số ghép cặp / giao lưu (docs/06 mục 10).
module.exports = Object.freeze({
  // Ban đầu 0.05; test thật cho thấy với danh sách lệch hai đầu (tốt nhất ≈ 0.115)
  // 0.05 cho phép chọn phương án kém hơn tới ~40% → siết còn 0.03.
  PAIRING_TOLERANCE: 0.03,
  PAIRING_RESTARTS: 30,
  PAIRING_STEPS_PER_PLAYER: 50,
  PAIRING_GAP_PENALTY: 1.0,
  PAIRING_REPEAT_PARTNER_PENALTY: 0.02,
  PAIRING_SAME_POSITION_PENALTY: 0.02,
  PAIRING_POOL_CAP: 2000,
  BASELINE_SIMULATIONS: 200,

  // Bước 3 (mô phỏng thực tế, mỗi sân một thời lượng, 40 seed × 7 kịch bản): 0.3 tuyến
  // tính để lặp đồng đội 3–4 lần; 0.5 × n² giữ ≤ 2 lần ở 20 người / 4 sân.
  SESSION_REPEAT_PARTNER_PENALTY: 0.5,
  SESSION_REPEAT_OPPONENT_PENALTY: 0.1,
  SESSION_BALANCE_SWAPS: 300,
  // Kéo một người "bằng trận" đứng sau hàng lên sớm để trộn nhóm (bước 3, test thật).
  SESSION_SKIP_PENALTY: 0.1,

  MATCH_MINUTES_DEFAULT: 15
});
