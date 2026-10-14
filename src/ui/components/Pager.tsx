interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label: string;
}

export function Pager({ page, totalPages, onChange, label }: Props) {
  return (
    <nav className="pager" aria-label={`${label} pagination`}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
        ‹
      </button>
      <span aria-live="polite" data-testid="page-indicator">
        Page {page} of {totalPages}
      </span>
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
        ›
      </button>
    </nav>
  );
}
