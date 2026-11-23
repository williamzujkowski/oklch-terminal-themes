import { sourceRoleStyle } from './specimen-roles';

type Root = Document | HTMLElement;
type Phase = 'idle' | 'invalid' | 'loading' | 'success';
interface Fields {
  title: string;
  email: string;
  density: 'comfortable' | 'compact';
  updates: boolean;
}
const DEFAULTS: Fields = {
  title: 'Palette review',
  email: 'not-an-email',
  density: 'comfortable',
  updates: true,
};
interface DemoState {
  root: Root;
  fields: Fields;
  phase: Phase;
  generation: number;
  disposed: boolean;
  selectedSeries: number;
  timer?: ReturnType<typeof setTimeout>;
}
export const DEMO_STATE_EVENT = 'demo-state-change';

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function cancel(s: DemoState): void {
  s.generation++;
  clearTimeout(s.timer);
  delete s.timer;
}
function announce(s: DemoState, message: string): void {
  const region = s.root.querySelector('[data-theme-announcer]');
  if (region) region.textContent = message;
}
function message(phase: Phase): string {
  if (phase === 'loading') return 'Sample update in progress; nothing is sent.';
  if (phase === 'success') return 'Sample complete. No data was sent or stored.';
  if (phase === 'invalid')
    return 'Enter a name of at least 3 characters and a complete sample email.';
  return 'Sample only. Changes stay in this demonstration.';
}
function paintValidity(
  field: HTMLInputElement | HTMLSelectElement,
  s: DemoState,
  name: 'title' | 'email',
): void {
  const invalid = name === 'email' ? !validEmail(s.fields.email) : s.fields.title.trim().length < 3;
  field.setAttribute('aria-invalid', String(invalid));
  field.dataset.role = invalid ? 'error' : 'body';
  field.setAttribute('style', sourceRoleStyle(invalid ? 'error' : 'body'));
  if (name !== 'email') return;
  const error = field.closest('form')?.querySelector<HTMLElement>('[data-demo-email-error]');
  const ids = [field.dataset.demoHelp, invalid ? error?.id : undefined].filter(Boolean).join(' ');
  if (ids) field.setAttribute('aria-describedby', ids);
  else field.removeAttribute('aria-describedby');
}
function paintField(field: HTMLInputElement | HTMLSelectElement, s: DemoState): void {
  const name = field.dataset.demoField;
  if (name === 'updates' && field instanceof HTMLInputElement) {
    field.checked = s.fields.updates;
    return;
  }
  if (name !== 'title' && name !== 'email' && name !== 'density') return;
  if (field.value !== s.fields[name]) field.value = s.fields[name];
  if (name !== 'density') paintValidity(field, s, name);
}
function paintFields(s: DemoState): void {
  for (const field of s.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '[data-demo-field]',
  ))
    paintField(field, s);
  for (const error of s.root.querySelectorAll<HTMLElement>('[data-demo-email-error]'))
    error.hidden = validEmail(s.fields.email);
}

function paint(s: DemoState): void {
  if (s.disposed) return;
  paintFields(s);
  for (const form of s.root.querySelectorAll<HTMLElement>('[data-demo-form]')) {
    form.setAttribute('aria-busy', String(s.phase === 'loading'));
    form.dataset.density = s.fields.density;
  }
  for (const button of s.root.querySelectorAll<HTMLButtonElement>('[data-demo-submit]')) {
    button.disabled = s.phase === 'loading';
    button.textContent = s.phase === 'loading' ? 'Working…' : 'Run sample';
  }
  for (const feedback of s.root.querySelectorAll<HTMLElement>('[data-demo-feedback]')) {
    feedback.textContent = message(s.phase);
    const role = s.phase === 'invalid' ? 'error' : s.phase === 'success' ? 'success' : 'muted';
    feedback.dataset.role = role;
    feedback.setAttribute('style', sourceRoleStyle(role));
  }
  for (const button of s.root.querySelectorAll<HTMLElement>('[data-select-series]')) {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.selectSeries === String(s.selectedSeries)),
    );
  }
  for (const label of s.root.querySelectorAll<HTMLElement>('[data-selected-series]'))
    label.textContent = `Series ${s.selectedSeries + 1} selected`;
  s.root.dispatchEvent(
    new CustomEvent(DEMO_STATE_EVENT, {
      bubbles: true,
      detail: { phase: s.phase, selectedSeries: s.selectedSeries },
    }),
  );
}
function edit(s: DemoState, event: Event): void {
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return;
  switch (field.dataset.demoField) {
    case 'title':
      s.fields.title = field.value.slice(0, 80);
      break;
    case 'email':
      s.fields.email = field.value.slice(0, 80);
      break;
    case 'density':
      if (field.value === 'comfortable' || field.value === 'compact')
        s.fields.density = field.value;
      break;
    case 'updates':
      if (field instanceof HTMLInputElement) s.fields.updates = field.checked;
      break;
    default:
      return;
  }
  cancel(s);
  s.phase = 'idle';
  paint(s);
}
function submit(s: DemoState, event: Event): void {
  if (!(event.target instanceof HTMLFormElement) || !event.target.hasAttribute('data-demo-form'))
    return;
  event.preventDefault();
  if (s.phase === 'loading') return;
  cancel(s);
  s.phase = validEmail(s.fields.email) && s.fields.title.trim().length >= 3 ? 'loading' : 'invalid';
  paint(s);
  announce(s, message(s.phase));
  if (s.phase !== 'loading') return;
  const generation = s.generation;
  s.timer = setTimeout(() => {
    if (s.disposed || s.generation !== generation) return;
    s.phase = 'success';
    paint(s);
    announce(s, message(s.phase));
  }, 650);
}

function onClick(s: DemoState, event: Event): void {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('[data-demo-action="reset"]')) {
    cancel(s);
    s.fields = { ...DEFAULTS };
    s.phase = 'idle';
    paint(s);
    announce(s, 'Sample reset.');
    return;
  }
  const raw = event.target.closest<HTMLElement>('[data-select-series]')?.dataset.selectSeries ?? '';
  if (!/^[0-7]$/.test(raw)) return;
  s.selectedSeries = Number(raw);
  paint(s);
  announce(s, `Sample series ${s.selectedSeries + 1} selected.`);
}

/** One bounded demo state for both panes. Every sample action remains local. */
export function wireDemoState(root: Root, signal: AbortSignal): () => void {
  if (signal.aborted) return () => {};
  const listeners = new AbortController();
  const s: DemoState = {
    root,
    fields: { ...DEFAULTS },
    phase: 'idle',
    generation: 0,
    disposed: false,
    selectedSeries: 0,
  };
  const dispose = (): void => {
    s.disposed = true;
    cancel(s);
    listeners.abort();
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  root.addEventListener('input', (event) => edit(s, event), { signal: listeners.signal });
  root.addEventListener('change', (event) => edit(s, event), { signal: listeners.signal });
  root.addEventListener('submit', (event) => submit(s, event), { signal: listeners.signal });
  root.addEventListener('click', (event) => onClick(s, event), { signal: listeners.signal });
  paint(s);
  return dispose;
}
