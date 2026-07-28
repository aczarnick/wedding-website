import type { AuditAction } from '@/lib/enums';
import type { AuditEntryView } from '@/lib/admin/audit';
import { AUDIT_ACTION_LABELS } from '@/constants/admin';

interface AuditEntryProps {
  entry: AuditEntryView;
}

function isKnownAction(action: string): action is AuditAction {
  return Object.prototype.hasOwnProperty.call(AUDIT_ACTION_LABELS, action);
}

function actionLabel(action: string): string {
  return isKnownAction(action) ? AUDIT_ACTION_LABELS[action] : action;
}

function formatTimestamp(createdAt: string): string {
  return new Date(createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatSnapshot(value: unknown): string {
  return value === null ? '—' : JSON.stringify(value, null, 2);
}

export const AuditEntry: React.FC<AuditEntryProps> = ({ entry }) => (
  <details className='rounded-lg border border-sage-200 bg-white p-4'>
    <summary className='flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-sage-800'>
      <span className='text-sage-700/80'>{formatTimestamp(entry.createdAt)}</span>
      <span className='font-medium'>{actionLabel(entry.action)}</span>
      <span className='text-sage-700/80'>{entry.actorEmail ?? entry.actorType}</span>
    </summary>

    <div className='mt-4 grid gap-4 sm:grid-cols-2'>
      <div>
        <h3 className='text-xs uppercase tracking-wide text-sage-700/80'>Before</h3>
        <pre className='mt-1 overflow-x-auto rounded-lg bg-sage-50 p-3 text-xs text-sage-800'>
          {formatSnapshot(entry.before)}
        </pre>
      </div>
      <div>
        <h3 className='text-xs uppercase tracking-wide text-sage-700/80'>After</h3>
        <pre className='mt-1 overflow-x-auto rounded-lg bg-sage-50 p-3 text-xs text-sage-800'>
          {formatSnapshot(entry.after)}
        </pre>
      </div>
    </div>
  </details>
);
