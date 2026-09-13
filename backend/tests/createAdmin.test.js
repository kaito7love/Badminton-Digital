const { validateAdminInput, MIN_PASSWORD_LENGTH } = require('../scripts/create-admin');

const valid = {
  ADMIN_EMAIL: 'Chu.San@Example.com',
  ADMIN_PASSWORD: 'mot-mat-khau-du-dai',
  ADMIN_FULL_NAME: 'Nguyễn Văn Chủ'
};

describe('create-admin — kiểm tra đầu vào trước khi chạm DB', () => {
  test('đầu vào hợp lệ, email được chuẩn hoá chữ thường', () => {
    const { input, problems } = validateAdminInput(valid);

    expect(problems).toEqual([]);
    expect(input.email).toBe('chu.san@example.com');
    expect(input.phone).toBeNull();
  });

  test(`mật khẩu dưới ${MIN_PASSWORD_LENGTH} ký tự bị từ chối`, () => {
    expect(validateAdminInput({ ...valid, ADMIN_PASSWORD: 'Abc@1234' }).problems).toHaveLength(1);
    expect(validateAdminInput({ ...valid, ADMIN_PASSWORD: 'Admin@123' }).problems).toHaveLength(1);
  });

  test('mật khẩu demo đã công khai bị từ chối dù đủ độ dài', () => {
    const { problems } = validateAdminInput({ ...valid, ADMIN_PASSWORD: 'Employee@123' });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/demo/);
  });

  test('thiếu email, thiếu họ tên, SĐT sai định dạng đều được báo cùng lúc', () => {
    const { problems } = validateAdminInput({ ADMIN_PASSWORD: valid.ADMIN_PASSWORD, ADMIN_PHONE: '12345' });

    expect(problems).toHaveLength(3);
  });

  test('SĐT hợp lệ được chuẩn hoá', () => {
    expect(validateAdminInput({ ...valid, ADMIN_PHONE: '+84 903 123 456' }).input.phone).toBe('0903123456');
  });
});
