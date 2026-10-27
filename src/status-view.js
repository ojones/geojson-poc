import { escapeHtml } from './results-view.js';

export const STATES = {
  ready: { icon: '○', text: 'Ready' },
  generating: { icon: '…', text: 'Generating' },
  generated: { icon: '✓', text: 'Generated' },
  replaying: { icon: '▶', text: 'Replaying' },
  paused: { icon: '❚❚', text: 'Paused' },
  completed: { icon: '■', text: 'Completed' },
  error: { icon: '✕', text: 'Error' },
};

export function setStatus(root, state, detail = '') {
  const { icon, text } = STATES[state];
  root.dataset.state = state;
  root.textContent = `${icon} ${text}${detail ? ` — ${detail}` : ''}`;
}

export function showErrors(root, messages) {
  root.hidden = messages.length === 0;
  root.innerHTML = messages.length === 0 ? '' : `<strong>Cannot continue</strong><ul>${messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`;
}
