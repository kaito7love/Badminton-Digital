export function getChartColors(theme) {
  const dark = theme === 'dark';
  return {
    grid: dark ? '#1e293b' : '#e2e8f0',
    axisTick: dark ? '#94a3b8' : '#64748b',
    tooltipBg: dark ? '#070a11' : '#ffffff',
    tooltipBorder: dark ? '#334155' : '#cbd5e1',
    tooltipText: dark ? '#ffffff' : '#0f172a',
    line: dark ? '#00FF66' : '#059669',
    area: dark ? '#10b981' : '#059669',
  };
}
