import type { ReactNode } from 'react';
import { describeError } from '@/api/client';

export function LoadingBox({ what }: { what: string }) {
  return (
    <div className="state-box" role="status">
      <span className="spinner" aria-hidden="true" />
      Loading {what}…
    </div>
  );
}

export function ErrorBox({ what, error, onRetry }: { what: string; error: unknown; onRetry: () => void }) {
  return (
    <div className="state-box error" role="alert">
      <p style={{ margin: '0 0 8px' }}>
        <strong>Couldn’t load {what}.</strong> {describeError(error)}
      </p>
      <button type="button" className="pager-retry link-btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div className="state-box" data-testid="empty-state">
      {children}
    </div>
  );
}
