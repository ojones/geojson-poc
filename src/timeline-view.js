import { activeEvents, EVENT_TYPES } from './events.js';
import { formatDuration } from './narrative.js';

function when(event) {
  const start = formatDuration(event.timestamp_s);
  return event.end_timestamp_s === null ? start : `${start}–${formatDuration(event.end_timestamp_s)}`;
}

function itemFor(event, onSeek) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.eventId = event.event_id;
  const title = document.createElement('strong');
  title.textContent = `${when(event)} · ${EVENT_TYPES[event.type]} (simulated)`;
  const detail = document.createElement('span');
  detail.textContent = event.summary;
  button.append(title, detail);
  button.addEventListener('click', () => onSeek(event.timestamp_s));
  item.append(button);
  return item;
}

export function renderTimeline(root, events, onSeek) {
  const list = root.querySelector('ol');
  list.replaceChildren(...events.map((event) => itemFor(event, onSeek)));
  root.querySelector('.timeline-empty').hidden = events.length > 0;
}

export function highlightEvents(root, events, t) {
  const active = new Set(activeEvents(events, t).map((e) => e.event_id));
  for (const button of root.querySelectorAll('button[data-event-id]')) {
    const on = active.has(button.dataset.eventId);
    button.classList.toggle('current', on);
    button.setAttribute('aria-current', on ? 'true' : 'false');
  }
}
