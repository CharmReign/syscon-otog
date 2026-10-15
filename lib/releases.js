// Release Sanity Health Check — constants shared by UI and server.
export const CHECK_STATUS = ['PENDING', 'PASS', 'FAIL', 'BLOCKED'];
export const CHECK_STATUS_LABELS = { PENDING: 'Pending', PASS: 'Pass', FAIL: 'Fail', BLOCKED: 'Blocked' };
export const RELEASE_STATUS = ['OPEN', 'CLOSED'];

// Readiness from check results. Critical failures or blocks put a release at risk.
export function releaseSummary(checks = []) {
  const counts = Object.fromEntries(CHECK_STATUS.map(s => [s, 0]));
  checks.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
  const risks = checks.filter(c => c.status === 'FAIL' || c.status === 'BLOCKED');
  const criticalOpen = checks.filter(c => c.critical && c.status !== 'PASS');
  let readiness = 'IN_PROGRESS';
  if (!checks.length) readiness = 'NO_CHECKS';
  else if (risks.some(c => c.critical)) readiness = 'AT_RISK';
  else if (counts.PASS === checks.length) readiness = 'READY';
  return {
    total: checks.length, counts, readiness,
    outstanding: counts.PENDING,
    risks: risks.map(c => ({ id: c.id, title: c.title, status: c.status, critical: !!c.critical })),
    criticalOpen: criticalOpen.length,
    percentDone: checks.length ? Math.round(((counts.PASS + counts.FAIL + counts.BLOCKED) / checks.length) * 100) : 0,
  };
}

export const READINESS_LABELS = { NO_CHECKS: 'No checks yet', IN_PROGRESS: 'In progress', AT_RISK: 'At risk', READY: 'Ready' };
