// OneTeamOneGoal roles. Shared by server guards and UI, so it must stay free of React and Node APIs.
//
// Both roles reach every module. ADMIN adds quiz-source management (upload, review,
// publish), checklist templates, and integration connection tests.
export const ROLES = { EMPLOYEE: 'EMPLOYEE', ADMIN: 'ADMIN' };

export const ROLE_LABELS = { EMPLOYEE: 'Employee', ADMIN: 'Administrator' };

export const isAdmin = (user) => user?.role === ROLES.ADMIN;
