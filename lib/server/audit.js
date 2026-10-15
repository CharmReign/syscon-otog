// Audit trail for administrative and workflow actions. Records who did what to which
// record; never document contents, answers or credentials.
import { v4 as uuidv4 } from 'uuid';
import { insertOne } from '@/lib/server/store';

export function audit(user, action, entityType, entityId, detail = '') {
  insertOne('auditLog', {
    id: uuidv4(),
    at: new Date().toISOString(),
    actorId: user?.id || null,
    actorName: user?.name || 'System',
    action,
    entityType,
    entityId,
    detail: String(detail).slice(0, 300),
  });
}
