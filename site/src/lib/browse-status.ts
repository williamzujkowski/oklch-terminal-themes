interface BrowseStatus {
  visible: number;
  total: number;
  query: string;
  tags: ReadonlySet<string>;
}

export function paintBrowseStatus(doc: Document, state: BrowseStatus): void {
  const count = `${state.visible.toLocaleString()} of ${state.total.toLocaleString()} themes`;
  const output = doc.querySelector('#listbox-count');
  if (output) output.textContent = count;
  const status = doc.querySelector<HTMLElement>('[data-browse-status]');
  if (!status) return;
  const summary = status.closest<HTMLElement>('.browse-summary');
  if (summary) summary.hidden = !state.query && state.tags.size === 0;
  const filters = [state.query ? `Search: ${state.query}` : '', ...state.tags].filter(Boolean);
  status.textContent = `${count}. ${state.tags.size + Number(Boolean(state.query))} active filters. ${filters.join('; ') || 'No filters'}`;
}
