// Bộ tiêu chí tự chấm — rubric v1 (docs/03 mục 2.1). Mã tiêu chí là khoá CỐ
// ĐỊNH: bài chấm AI sau này trả về đúng các mã này. Sửa mô tả = ra v2, không sửa
// tại chỗ (mỗi bài chấm lưu version đã dùng để tính lại được).

const criterion = (code, page, name, weights, anchors, gate = false) => ({
  code,
  page,
  name,
  weights: { singles: weights[0], doubles: weights[1] },
  gate,
  anchors: anchors.map((text, i) => ({ level: i + 1, text }))
});

const CRITERIA = [
  criterion('serve', 1, 'Giao cầu & đỡ giao cầu', [1, 1.5], [
    'Giao hay hỏng (chạm lưới, ra ngoài); chưa phân biệt giao ngắn và giao dài.',
    'Giao được cả ngắn lẫn dài nhưng cầu ngắn thường cao, dễ bị ép; đỡ giao chủ yếu đánh lên cao.',
    'Giao ngắn trái tay sát lưới khá đều; đỡ giao đặt / đẩy được vào khoảng trống, ít khi phải lên cầu bị động.',
    'Giao ngắn đều, biết giao bổng / giao nhanh bất ngờ; đỡ giao chủ động ép lại (vê, đẩy nhanh, chặn lưới).',
    'Gần như không hỏng giao, đổi nhịp và điểm rơi có chủ đích; đỡ giao gây sức ép ngay từ cú đầu tiên.'
  ]),
  criterion('clear', 1, 'Cầu cao sâu thuận tay (phông)', [1.5, 0.5], [
    'Phông thuận tay chưa qua được nửa sân bên kia.',
    'Phông tới giữa sân bên kia; lùi về cuối sân thì hay trượt cầu.',
    'Có thời gian chuẩn bị thì phông từ cuối sân tới gần cuối sân bên kia.',
    'Phông cuối sân sang cuối sân ổn định; đánh được cả phông tấn công (thấp, nhanh).',
    'Phông sâu, chính xác kể cả khi bị ép; dùng phông để kéo giãn và điều cầu.'
  ]),
  criterion('backhand', 1, 'Trái tay', [1.5, 1], [
    'Gần như không đánh được trái tay, luôn cố chạy vòng sang thuận tay.',
    'Đỡ trái tay được cầu giữa sân; lên cầu chưa qua nổi nửa sân đối phương.',
    'Giữa sân đẩy trái tay ra cuối sân được; ở cuối sân chỉ đưa được cầu qua lưới.',
    'Trái tay cuối sân đánh cao sâu quá nửa sân bên kia; bỏ nhỏ trái tay có chủ đích.',
    'Trái tay cuối sân đánh hết sân, đổi hướng được (phông, chặt, bỏ nhỏ) cả khi bị ép.'
  ], true),
  criterion('smash', 2, 'Đập cầu', [1, 1.5], [
    'Chưa đập được, hoặc đập hay vào lưới / ra ngoài.',
    'Đập được cầu dễ (cầu cao giữa sân), lực yếu, chủ yếu đập thẳng.',
    'Đập có lực từ giữa sân, chọn được hướng thẳng / chéo; cầu sâu thì còn hụt.',
    'Đập mạnh cả từ cuối sân, đập dọc biên, có bật nhảy đập, nối được cú tiếp theo.',
    'Đập nặng, góc hẹp, liên tục nhiều cú, đổi nhịp đập – chặt – đập để kết thúc pha cầu.'
  ]),
  criterion('drop', 2, 'Bỏ nhỏ / chặt cầu từ cuối sân', [1, 0.5], [
    'Chưa bỏ nhỏ được từ cuối sân.',
    'Bỏ nhỏ được khi có thời gian, nhưng cầu cao, rơi xa lưới.',
    'Khi thuận lợi, bỏ nhỏ / chặt từ cuối sân rơi gần lưới.',
    'Chặt nhanh, chặt chéo có chủ đích; cùng một động tác chuẩn bị ra được phông, đập hoặc chặt.',
    'Chặt / bỏ nhỏ sát lưới cả khi bị ép, đánh lừa được đối phương về hướng và nhịp.'
  ]),
  criterion('net', 2, 'Kỹ thuật lưới', [1, 1.5], [
    'Ở lưới chủ yếu đánh lên cao, hay chạm lưới.',
    'Đưa cầu qua lưới được nhưng cầu cao, dễ bị chặn / dập.',
    'Vê lưới, đẩy cầu sang hai góc cuối sân khá ổn định.',
    'Vê sát lưới, chặn / dập lưới khi cầu cao, móc chéo lưới.',
    'Kiểm soát lưới vượt trội: vê xoáy, giả động tác, tranh cầu sớm, ghi điểm từ lưới.'
  ]),
  criterion('defense', 3, 'Phòng thủ, đỡ đập, đánh ngang (drive)', [1, 1.5], [
    'Gần như không đỡ được cú đập.',
    'Đỡ được đập nhẹ, nhưng cầu trả về cao và ngắn nên bị ép tiếp.',
    'Đỡ được đập vừa, trả về cao sâu; drive qua lại được ở tốc độ vừa.',
    'Đỡ đập trả ngắn hoặc đẩy nhanh để chuyển sang tấn công; drive nhanh ổn định cả hai tay.',
    'Đỡ được đập mạnh sát người và hai bên, phản công ngay (chặn lưới, drive, đỡ dài chéo).'
  ], true),
  criterion('footwork', 3, 'Di chuyển', [1.5, 1], [
    'Chạy nhiều bước nhỏ, hay đứng chờ cầu, thường lỡ nhịp.',
    'Lên lưới và về cuối sân được, nhưng về vị trí giữa sân chậm.',
    'Có bước đệm (split step), về giữa sân sau mỗi cú; góc cuối sân trái tay còn chậm.',
    'Di chuyển 6 góc sân nhịp nhàng, bước chéo / bước đuổi đúng, lấy cầu sớm.',
    'Nhanh, ít bước thừa, bật nhảy lấy cầu cả hai góc cuối, giữ thăng bằng cả khi bị ép.'
  ], true),
  criterion('stamina', 3, 'Thể lực', [1.5, 0.5], [
    'Mệt rõ sau một set 21 điểm ở cường độ vừa.',
    'Đánh được 2–3 set giao lưu, nhưng pha cầu dài thì tụt sức nhanh.',
    'Đánh hết một trận 3 set cường độ cao mà vẫn giữ được chất lượng cú đánh.',
    'Đánh liên tục nhiều trận trong một buổi giải, phong độ ổn định.',
    'Tập thể lực bài bản; giữ tốc độ cao suốt các pha cầu dài và các trận liên tiếp.'
  ]),
  criterion('tactics', 4, 'Chiến thuật, đọc cầu', [1, 1], [
    'Chủ yếu đánh cầu về giữa sân, chưa có ý đồ.',
    'Biết đánh vào chỗ trống khi đối phương đứng lệch rõ.',
    'Biết đánh vào điểm yếu của đối phương (vd trái tay), đổi dài – ngắn.',
    'Xây dựng pha cầu (kéo giãn rồi mới kết thúc); đổi lối đánh giữa các game.',
    'Đọc được ý đồ đối phương, đoán trước hướng cầu, chủ động điều nhịp trận.'
  ]),
  criterion('rotation', 4, 'Phối hợp đánh đôi', [0, 1.5], [
    'Chưa biết đứng đâu khi đánh đôi, hay tranh cầu hoặc để cầu rơi giữa hai người.',
    'Biết đứng trên – dưới khi tấn công và song song khi phòng thủ, nhưng chuyển chậm.',
    'Chuyển đội hình công – thủ theo pha cầu khá đúng lúc, ít va chạm với đồng đội.',
    'Chủ động tạo cơ hội cho đồng đội (đánh xuống để đồng đội chặn lưới), xoay vòng mượt.',
    'Phối hợp nhuần nhuyễn với nhiều kiểu đồng đội, giữ thế tấn công liên tục, bọc lót tốt.'
  ]),
  criterion('experience', 4, 'Kinh nghiệm thi đấu', [1, 1], [
    'Chơi dưới 6 tháng.',
    'Chơi đều 6 tháng – 2 năm, chủ yếu giao lưu, chưa đánh giải.',
    'Chơi trên 2 năm, đã đánh giải phong trào (CLB, công ty, phường / xã).',
    'Từng vào tứ kết / bán kết giải phong trào cấp quận / huyện hoặc giải mở rộng tương đương.',
    'Từng vào bán kết giải cấp tỉnh / thành trở lên, hoặc từng tập ở đội năng khiếu / chuyên nghiệp.'
  ])
];

const PAGES = [
  { page: 0, title: 'Thông tin chơi' },
  { page: 1, title: 'Kỹ thuật nền tảng' },
  { page: 2, title: 'Tấn công' },
  { page: 3, title: 'Phòng thủ và thể lực' },
  { page: 4, title: 'Tư duy và kinh nghiệm' }
];

// Câu hỏi bước 0 — không tính điểm.
const PROFILE_QUESTIONS = [
  { field: 'gender', label: 'Giới tính', required: true, options: ['male', 'female'] },
  { field: 'birthYear', label: 'Năm sinh', required: false },
  { field: 'dominantHand', label: 'Tay thuận', required: false, options: ['right', 'left'] },
  { field: 'playingSinceYear', label: 'Năm bắt đầu chơi', required: false },
  { field: 'sessionsPerWeek', label: 'Số buổi mỗi tuần', required: false },
  { field: 'preferredPlay', label: 'Thường đánh', required: false, options: ['singles', 'doubles', 'both'] },
  { field: 'doublesPosition', label: 'Vị trí ưa thích khi đánh đôi', required: false, options: ['front', 'back', 'both'] }
];

module.exports = Object.freeze({
  version: 'v1',
  instructions: 'Chọn mô tả giống bạn nhất ở phần lớn các buổi chơi, không chọn theo lúc chơi hay nhất.',
  pages: PAGES,
  profileQuestions: PROFILE_QUESTIONS,
  criteria: CRITERIA,
  // Mức 5 ở tiêu chí này → gắn cờ "Cần BTC xác nhận".
  verificationTrigger: { criterion: 'experience', level: 5 }
});
