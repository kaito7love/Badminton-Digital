import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { resolveActiveChild } from './siteNav';
import { TONES } from './siteTone';

const LINK =
  'inline-flex items-center border-b-2 py-1.5 font-kinetic text-xs font-bold uppercase tracking-widest transition-colors';

const Chevron = ({ open }) => (
  <svg viewBox="0 0 10 6" className={`h-2 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor" aria-hidden="true">
    <path d="M0 0h10L5 6z" />
  </svg>
);

/**
 * Một mục của thanh trên máy tính. Có mục con thì: chữ bấm vào là vào trang chính, ▾ riêng để mở menu (chạm / bàn phím),
 * rê chuột cũng mở. Không có mục con thì chỉ là một liên kết.
 */
export default function NavItem({ item, active, location, tone, dropdown }) {
  const t = TONES[tone];
  const caretRef = useRef(null);
  const hasMenu = item.children && item.children.length > 0;
  const isOpen = hasMenu && dropdown.openKey === item.key;
  const activeChild = hasMenu ? resolveActiveChild(item, location) : null;
  const menuId = `site-menu-${item.key}`;

  const link = (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={`${LINK} ${active ? t.linkOn : t.link}`}
      onClick={dropdown.close}
    >
      {item.label}
    </Link>
  );
  if (!hasMenu) return <div className="relative flex items-center">{link}</div>;

  return (
    <div
      className="relative flex items-center"
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') dropdown.open(item.key); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') dropdown.closeSoon(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isOpen) { dropdown.close(); caretRef.current?.focus(); }
      }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) dropdown.closeSoon(); }}
    >
      {link}
      <button
        ref={caretRef}
        type="button"
        aria-label={`Mở menu ${item.label}`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => dropdown.toggle(item.key)}
        className={`ml-1 inline-flex h-7 w-6 items-center justify-center rounded-md ${t.caret}`}
      >
        <Chevron open={isOpen} />
      </button>
      {isOpen && (
        <div id={menuId} className="absolute left-0 top-full z-50 pt-0" role="group" aria-label={item.label}>
          <div className={`min-w-[17rem] rounded-2xl p-2 ${t.panel}`}>
            {item.children.map((child) => (
              <Link
                key={child.key}
                to={child.to}
                onClick={dropdown.close}
                aria-current={activeChild === child.key ? 'page' : undefined}
                className={`grid rounded-xl px-3 py-2.5 text-sm font-bold ${activeChild === child.key ? t.panelItemOn : t.panelItem}`}
              >
                {child.label}
                {child.hint && <span className={`text-xs font-medium ${t.hint}`}>{child.hint}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
