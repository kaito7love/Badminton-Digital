import React, { useEffect, useRef, useState } from 'react';
import { courtService, publicService } from '../../services/apiServices';
import { useBranch } from '../../contexts/BranchContext';

const COURT_W = 180;
const COURT_H = 105;
const DEFAULT_CANVAS = { width: 1000, height: 600 };

const ZONE_CLASS_LABELS = {
  parking: 'Bãi xe',
  wait: 'Khu khách ngồi nghỉ',
  counter: 'Quầy thu ngân',
  office: 'Văn phòng',
  show: 'Show-room',
  entrance: 'Cửa',
  back: 'Nền / backdrop',
  custom: 'Khác',
};

const ZONE_STYLES = {
  parking: 'bg-amber-500/10 border-amber-400/40 text-amber-700 dark:text-amber-300',
  wait: 'bg-sky-500/10 border-sky-400/40 text-sky-700 dark:text-sky-300',
  counter: 'bg-amber-400/20 border-amber-400/50 text-amber-800 dark:text-amber-200',
  office: 'bg-slate-500/10 border-slate-400/40 text-slate-600 dark:text-slate-300',
  show: 'bg-fuchsia-500/10 border-fuchsia-400/40 text-fuchsia-700 dark:text-fuchsia-300',
  entrance: 'bg-transparent border-slate-400/50 text-slate-500',
  back: 'bg-slate-500/5 border-slate-400/30 text-slate-500',
  custom: 'bg-indigo-500/10 border-indigo-400/40 text-indigo-700 dark:text-indigo-300',
};

export default function CourtLayoutPage() {
  const { selectedBranchId, branches } = useBranch() || {};
  const branch = branches?.find((b) => String(b.id) === String(selectedBranchId));

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');

  const [canvas, setCanvas] = useState(DEFAULT_CANVAS);
  const [courts, setCourts] = useState([]);
  const [zones, setZones] = useState([]);
  const [realCourts, setRealCourts] = useState([]);
  const [selected, setSelected] = useState(null); // { type: 'court' | 'zone', index }
  const [addCourtName, setAddCourtName] = useState('');

  const savedSnapshotRef = useRef('');
  const canvasWrapRef = useRef(null);
  const [scale, setScale] = useState(1);

  const dirty = JSON.stringify({ canvas, courts, zones }) !== savedSnapshotRef.current;

  // Tải sơ đồ hiện có (file tĩnh, cùng nguồn với sơ đồ khách hàng đang xem) +
  // danh sách sân thật của chi nhánh — mỗi lần đổi chi nhánh (admin) tải lại.
  useEffect(() => {
    if (!selectedBranchId) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSelected(null);
    Promise.all([publicService.getBranchLayout(selectedBranchId), courtService.getAllCourts()])
      .then(([layout, courtsRes]) => {
        if (cancelled) return;
        const initial = layout || { canvas: DEFAULT_CANVAS, courts: [], zones: [] };
        setCanvas(initial.canvas);
        setCourts(initial.courts);
        setZones(initial.zones);
        savedSnapshotRef.current = JSON.stringify({ canvas: initial.canvas, courts: initial.courts, zones: initial.zones });
        setRealCourts(courtsRes.data?.data || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Không tải được sơ đồ hoặc danh sách sân. Vui lòng thử lại.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBranchId]);

  // Thu nhỏ sơ đồ vừa khít bề ngang khung chứa — không bao giờ hiện thanh
  // trượt ngang, kể cả khi canvas rộng hơn màn hình. Không phóng to quá 1
  // (canvas nhỏ hơn khung thì giữ nguyên kích thước thật, không kéo giãn).
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return undefined;
    const compute = () => {
      const available = el.clientWidth;
      setScale(available > 0 ? Math.min(1, available / canvas.width) : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
    // `loading` bắt buộc có trong deps: div chứa canvasWrapRef chỉ mount sau
    // khi tải xong (return sớm lúc loading=true), nên nếu chỉ phụ thuộc
    // canvas.width thì lần load đầu tiên effect chạy trước khi ref tồn tại
    // và không bao giờ chạy lại nếu width tải về trùng giá trị mặc định.
  }, [canvas.width, loading]);

  // Rời trang khi còn thay đổi chưa lưu thì cảnh báo — kéo/xoay cả chục món
  // rồi mất trắng vì lỡ tay bấm back là rất khó chịu.
  useEffect(() => {
    const handler = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Bỏ hết thay đổi chưa lưu, quay về đúng bản đã lưu gần nhất (hoặc canvas
  // trống mặc định nếu chi nhánh chưa từng có file layout) — không gọi API,
  // chỉ nạp lại snapshot đã giữ sẵn trong bộ nhớ.
  const handleReset = () => {
    const snapshot = savedSnapshotRef.current
      ? JSON.parse(savedSnapshotRef.current)
      : { canvas: DEFAULT_CANVAS, courts: [], zones: [] };
    setCanvas(snapshot.canvas);
    setCourts(snapshot.courts);
    setZones(snapshot.zones);
    setSelected(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const payload = { canvas, courts, zones };
    try {
      await courtService.updateLayout(payload);
      savedSnapshotRef.current = JSON.stringify(payload);
      setSaveMessage('Đã lưu ✓');
      setTimeout(() => setSaveMessage(''), 2500);
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCourt = () => {
    if (!addCourtName) return;
    setCourts((cur) => [...cur, { courtName: addCourtName, x: 40, y: 40, rotation: 0 }]);
    setAddCourtName('');
  };

  const handleAddZone = () => {
    setZones((cur) => [...cur, { label: 'Khu vực mới', x: 40, y: 40, w: 150, h: 90, cls: 'custom', rotation: 0 }]);
    setSelected({ type: 'zone', index: zones.length });
  };

  const rotateSelected = (deg) => {
    if (!selected) return;
    const apply = (arr) =>
      arr.map((item, i) =>
        i === selected.index ? { ...item, rotation: deg === 0 ? 0 : ((item.rotation || 0) + deg) % 360 } : item,
      );
    if (selected.type === 'court') setCourts(apply(courts));
    else setZones(apply(zones));
  };

  const removeSelected = () => {
    if (!selected) return;
    if (selected.type === 'court') setCourts((c) => c.filter((_, i) => i !== selected.index));
    else setZones((z) => z.filter((_, i) => i !== selected.index));
    setSelected(null);
  };

  const renameSelectedZone = () => {
    if (!selected || selected.type !== 'zone') return;
    const val = window.prompt('Đổi tên khu vực:', zones[selected.index].label);
    if (val === null || !val.trim()) return;
    setZones((z) => z.map((item, i) => (i === selected.index ? { ...item, label: val.trim() } : item)));
  };

  const changeSelectedZoneClass = (cls) => {
    if (!selected || selected.type !== 'zone') return;
    setZones((z) => z.map((item, i) => (i === selected.index ? { ...item, cls } : item)));
  };

  const moveZoneLayer = (dir) => {
    if (!selected || selected.type !== 'zone') return;
    const i = selected.index;
    if (dir === 1 && i < zones.length - 1) {
      setZones((z) => {
        const copy = [...z];
        [copy[i], copy[i + 1]] = [copy[i + 1], copy[i]];
        return copy;
      });
      setSelected({ type: 'zone', index: i + 1 });
    } else if (dir === -1 && i > 0) {
      setZones((z) => {
        const copy = [...z];
        [copy[i], copy[i - 1]] = [copy[i - 1], copy[i]];
        return copy;
      });
      setSelected({ type: 'zone', index: i - 1 });
    }
  };

  const zoneToEdge = (edge) => {
    if (!selected || selected.type !== 'zone') return;
    setZones((z) => {
      const copy = [...z];
      const [item] = copy.splice(selected.index, 1);
      if (edge === 'front') copy.push(item);
      else copy.unshift(item);
      return copy;
    });
    setSelected({ type: 'zone', index: edge === 'front' ? zones.length - 1 : 0 });
  };

  // Kéo mượt: sửa trực tiếp style của DOM node trong lúc kéo (không setState
  // mỗi pixel di chuyển), chỉ commit vào state lúc thả chuột.
  const startCourtDrag = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ type: 'court', index });
    const el = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const { x: ox, y: oy } = courts[index];
    let nx = ox;
    let ny = oy;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      // Canvas đang hiển thị thu nhỏ theo `scale` — 1px chuột di chuyển
      // tương ứng 1/scale px trong toạ độ thật của sơ đồ.
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      nx = Math.max(0, Math.min(canvas.width - COURT_W, ox + dx));
      ny = Math.max(0, Math.min(canvas.height - COURT_H, oy + dy));
      el.style.left = `${nx}px`;
      el.style.top = `${ny}px`;
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      setCourts((cur) => cur.map((c, i) => (i === index ? { ...c, x: nx, y: ny } : c)));
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const startZoneDrag = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ type: 'zone', index });
    const el = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const { x: ox, y: oy, w, h } = zones[index];
    let nx = ox;
    let ny = oy;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      nx = Math.max(0, Math.min(canvas.width - w, ox + dx));
      ny = Math.max(0, Math.min(canvas.height - h, oy + dy));
      el.style.left = `${nx}px`;
      el.style.top = `${ny}px`;
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      setZones((cur) => cur.map((z, i) => (i === index ? { ...z, x: nx, y: ny } : z)));
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const startZoneResize = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ type: 'zone', index });
    const handle = e.currentTarget;
    const boxEl = handle.parentElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const { x, y, w: ow, h: oh } = zones[index];
    let nw = ow;
    let nh = oh;
    handle.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      nw = Math.max(30, Math.min(canvas.width - x, ow + dx));
      nh = Math.max(20, Math.min(canvas.height - y, oh + dy));
      boxEl.style.width = `${nw}px`;
      boxEl.style.height = `${nh}px`;
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      setZones((cur) => cur.map((z, i) => (i === index ? { ...z, w: nw, h: nh } : z)));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  };

  const availableToAdd = realCourts.filter((c) => !courts.some((lc) => lc.courtName === c.name));

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải sơ đồ...</div>;
  if (loadError) return <div className="p-8 text-rose-600 dark:text-rose-400">❌ {loadError}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400 font-medium">
            Court Floor Plan Editor
          </p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            Sơ đồ mặt bằng — {branch?.name || '…'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Kéo để di chuyển, kéo ô góc để đổi kích thước khu vực. Khách hàng ở trang chủ sẽ thấy thay đổi ngay sau khi lưu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saveMessage && <span className="whitespace-nowrap text-sm font-semibold text-emerald-600 dark:text-emerald-400">{saveMessage}</span>}
          {saveError && <span className="whitespace-nowrap text-sm font-semibold text-rose-600 dark:text-rose-400">{saveError}</span>}
          {dirty && !saveMessage && <span className="whitespace-nowrap text-xs text-amber-600 dark:text-amber-400">Chưa lưu</span>}
          <button
            onClick={handleReset}
            disabled={!dirty || saving}
            title="Bỏ thay đổi chưa lưu, quay về bản đã lưu gần nhất"
            className="shrink-0 whitespace-nowrap rounded-2xl border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↺ Khôi phục
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="shrink-0 whitespace-nowrap rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : 'Lưu bố cục'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Panel trái */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Kích thước sơ đồ</h3>
            <div className="flex items-center gap-2 text-sm">
              <input
                type="number"
                min={200}
                value={canvas.width}
                onChange={(e) => setCanvas((c) => ({ ...c, width: Number(e.target.value) || c.width }))}
                className="w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
              />
              <span className="text-slate-400">×</span>
              <input
                type="number"
                min={200}
                value={canvas.height}
                onChange={(e) => setCanvas((c) => ({ ...c, height: Number(e.target.value) || c.height }))}
                className="w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Thêm sân vào sơ đồ</h3>
            {availableToAdd.length === 0 ? (
              <p className="text-xs text-slate-400">
                {realCourts.length === 0 ? 'Chi nhánh chưa có sân nào — thêm sân ở Quản Lý Sân trước.' : 'Mọi sân đã có trên sơ đồ.'}
              </p>
            ) : (
              <div className="flex gap-2">
                <select
                  value={addCourtName}
                  onChange={(e) => setAddCourtName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="">Chọn sân…</option>
                  {availableToAdd.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddCourt}
                  disabled={!addCourtName}
                  className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  +
                </button>
              </div>
            )}
            <button
              onClick={handleAddZone}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              + Thêm khu vực
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Đang chọn</h3>
            {!selected && <p className="text-xs text-slate-400">Chưa chọn sân hoặc khu vực nào trên sơ đồ.</p>}

            {selected?.type === 'court' && courts[selected.index] && (
              <div className="space-y-3 text-sm">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{courts[selected.index].courtName}</p>
                <div className="flex gap-2">
                  <button onClick={() => rotateSelected(-90)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">↶</button>
                  <button onClick={() => rotateSelected(90)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">↷</button>
                  <button onClick={() => rotateSelected(0)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">↻</button>
                </div>
                <button onClick={removeSelected} className="w-full rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 py-2 text-xs font-bold hover:bg-rose-500/20">
                  🗑 Gỡ khỏi sơ đồ
                </button>
              </div>
            )}

            {selected?.type === 'zone' && zones[selected.index] && (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{zones[selected.index].label}</p>
                  <button onClick={renameSelectedZone} className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400 hover:underline">✏️ Đổi tên</button>
                </div>
                <select
                  value={zones[selected.index].cls}
                  onChange={(e) => changeSelectedZoneClass(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {Object.entries(ZONE_CLASS_LABELS).map(([cls, label]) => (
                    <option key={cls} value={cls}>{label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => rotateSelected(-90)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">↶</button>
                  <button onClick={() => rotateSelected(90)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">↷</button>
                  <button onClick={() => rotateSelected(0)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">↻</button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button onClick={() => moveZoneLayer(1)} className="rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">⬆ Lên 1 lớp</button>
                  <button onClick={() => moveZoneLayer(-1)} className="rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">⬇ Xuống 1 lớp</button>
                  <button onClick={() => zoneToEdge('front')} className="rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">⤒ Lên trên cùng</button>
                  <button onClick={() => zoneToEdge('back')} className="rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">⤓ Xuống dưới cùng</button>
                </div>
                <button onClick={removeSelected} className="w-full rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 py-2 text-xs font-bold hover:bg-rose-500/20">
                  🗑 Xoá khu vực
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-4">
          {/* Thu nhỏ theo `scale` để vừa khít bề ngang, không bao giờ cần
              thanh trượt ngang — chiều cao div ngoài phải khai theo kích
              thước ĐÃ thu nhỏ, vì transform:scale không tự co layout box. */}
          <div ref={canvasWrapRef} className="overflow-hidden" style={{ height: canvas.height * scale }}>
            <div
              className="relative rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              style={{
                width: canvas.width,
                height: canvas.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                backgroundImage:
                  'linear-gradient(rgba(100,116,139,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.08) 1px, transparent 1px)',
                backgroundSize: '25px 25px',
              }}
              onClick={() => setSelected(null)}
            >
              {zones.map((zone, i) => (
                <div
                  key={`zone-${i}`}
                  onPointerDown={(e) => startZoneDrag(e, i)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected({ type: 'zone', index: i });
                  }}
                  className={`absolute flex cursor-move items-center justify-center rounded-md border px-1 text-center text-[10px] font-bold uppercase tracking-wide select-none ${ZONE_STYLES[zone.cls] || ZONE_STYLES.custom} ${
                    selected?.type === 'zone' && selected.index === i ? 'outline outline-2 outline-emerald-500' : ''
                  }`}
                  style={{
                    left: zone.x,
                    top: zone.y,
                    width: zone.w,
                    height: zone.h,
                    transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
                  }}
                >
                  {zone.label}
                  <div
                    onPointerDown={(e) => startZoneResize(e, i)}
                    className="absolute -right-1.5 -bottom-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded border-2 border-white bg-emerald-500 dark:border-slate-900"
                  />
                </div>
              ))}

              {courts.map((entry, i) => (
                <div
                  key={`court-${i}`}
                  onPointerDown={(e) => startCourtDrag(e, i)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected({ type: 'court', index: i });
                  }}
                  className={`absolute flex cursor-move select-none items-center justify-center rounded-xl border border-emerald-400/50 bg-emerald-500/15 font-kinetic text-sm font-black text-slate-800 dark:text-emerald-100 ${
                    selected?.type === 'court' && selected.index === i ? 'outline outline-2 outline-emerald-500' : ''
                  }`}
                  style={{
                    left: entry.x,
                    top: entry.y,
                    width: COURT_W,
                    height: COURT_H,
                    transform: entry.rotation ? `rotate(${entry.rotation}deg)` : undefined,
                  }}
                >
                  {entry.courtName}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
