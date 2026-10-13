import React from 'react';
import { Link } from 'react-router-dom';
import { TONES } from './siteTone';

/** Thanh tab dưới trên điện thoại: luôn hiện ở mọi trang có header chung. Ô của khu đang đứng sáng và có gạch ngắn trên đầu. */
export default function MobileTabBar({ tabs, activeKey, tone }) {
  const t = TONES[tone];
  return (
    <nav
      aria-label="Điều hướng nhanh"
      className={`fixed inset-x-0 bottom-0 z-40 lg:hidden ${t.tabs}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
        {tabs.map((tab) => {
          const on = tab.key === activeKey;
          return (
            <Link
              key={tab.key}
              to={tab.to}
              aria-current={on ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-bold ${on ? t.tabOn : t.tab}`}
            >
              {on && <span className="absolute inset-x-[28%] top-0 h-0.5 rounded-b-full bg-current" aria-hidden="true" />}
              <span className="text-xl leading-none" aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
