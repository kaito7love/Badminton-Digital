import React, { useState, useEffect } from 'react';
import { Modal, Badge } from '../../components/UIComponents';
import { employeeService } from '../../services/apiServices';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null); // null = Create, object = Edit
  const [formData, setFormData] = useState({
    password: '',
    email: '',
    fullName: '',
    position: 'Nhân viên',
    shift: 'Ca sáng',
  });

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await employeeService.getAllEmployees();
      const data = res.data?.data || res.data || [];
      setEmployees(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Lỗi tải danh sách nhân viên');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleOpenAddModal = () => {
    setEditingEmployee(null);
    setFormData({
      password: '',
      email: '',
      fullName: '',
      position: 'Nhân viên',
      shift: 'Ca sáng',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      password: '',
      email: employee.email || employee.user?.email || '',
      fullName: employee.fullName || employee.name || '',
      position: employee.position || 'Nhân viên',
      shift: employee.shift || 'Ca sáng',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingEmployee) {
        // Edit mode
        await employeeService.updateEmployee(editingEmployee.id, {
          position: formData.position,
          shift: formData.shift,
        });
      } else {
        // Create mode
        await employeeService.createEmployee({
          password: formData.password,
          email: formData.email,
          fullName: formData.fullName,
          position: formData.position,
          shift: formData.shift,
        });
      }
      setIsModalOpen(false);
      fetchEmployees();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi lưu thông tin nhân viên');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Bạn có chắc muốn xóa nhân viên "${name}"?`)) return;
    try {
      await employeeService.deleteEmployee(id);
      fetchEmployees();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi xóa nhân viên');
    }
  };

  if (loading) return <div className="p-8 text-slate-300">⏳ Đang tải danh sách nhân viên...</div>;
  if (error) return <div className="p-8 text-rose-400">❌ {error}</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-400 font-medium">Employees</p>
          <h1 className="text-3xl font-bold text-slate-100">Quản lý nhân viên</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Quản lý danh sách nhân viên, ca làm việc và quyền truy cập hệ thống.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="rounded-3xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          + Thêm nhân viên
        </button>
      </div>

      {/* Grid Nhân Viên */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
        {employees.length === 0 ? (
          <p className="text-center text-slate-400 py-8">Chưa có nhân viên nào.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((emp) => {
              const name = emp.user?.fullName || emp.user?.full_name || emp.fullName || emp.full_name || emp.name || 'N/A';
              const email = emp.email || emp.user?.email || '';
              const role = emp.position || emp.role || 'Nhân viên';
              const shift = emp.shift || 'Ca sáng';

              return (
                <div
                  key={emp.id}
                  className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">{role}</span>
                      <Badge variant="emerald">{shift}</Badge>
                    </div>
                    <h2 className="mt-3 text-xl font-bold text-slate-100">{name}</h2>
                    {email && <p className="text-xs text-slate-400 mt-1">📧 {email}</p>}
                    {emp.phone && <p className="text-xs text-slate-400 mt-0.5">📞 {emp.phone}</p>}
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-slate-800/80 text-xs">
                    <button
                      onClick={() => handleOpenEditModal(emp)}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-800/50 py-2 font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition"
                    >
                      ✏️ Chỉnh sửa
                    </button>
                    <button
                      onClick={() => handleDelete(emp.id, name)}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-medium text-rose-400 hover:bg-rose-500/20 transition"
                    >
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Thêm / Sửa Nhân Viên */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEmployee ? `Chỉnh Sửa Nhân Viên: ${editingEmployee.fullName || editingEmployee.name}` : 'Thêm Nhân Viên Mới'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editingEmployee && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Mật khẩu *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                  placeholder="Tối thiểu 6 ký tự"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                  placeholder="Nguyễn Văn A"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                  placeholder="vana@badminton.com"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Chức vụ / Vị trí</label>
              <select
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="Nhân viên">Nhân viên thu ngân</option>
                <option value="Quản lý sân">Quản lý sân</option>
                <option value="Kỹ thuật">Kỹ thuật / Bảo trì</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Ca làm việc</label>
              <select
                value={formData.shift}
                onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="Ca sáng">Ca sáng (06:00 - 14:00)</option>
                <option value="Ca chiều">Ca chiều (14:00 - 22:00)</option>
                <option value="Ca tối">Ca tối (18:00 - 23:00)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              {editingEmployee ? 'Lưu Thay Đổi' : 'Thêm Nhân Viên'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
