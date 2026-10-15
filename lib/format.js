export const fmtCurrency = (n, cur = 'AUD') =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0);
export const fmtNum = (n) => new Intl.NumberFormat('en-US').format(n || 0);
export const initials = (name = '') => name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const units = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
  let v = s / 60;
  for (const [step, unit] of units) {
    if (v < step) { const n = Math.floor(v); return `${n} ${unit}${n === 1 ? '' : 's'} ago`; }
    v /= step;
  }
  return '';
}
