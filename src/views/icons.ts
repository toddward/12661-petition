import { raw } from 'hono/html';

/*
 * Authored line icons, one stroke weight (1.75 on a 24 grid), drawn in currentColor.
 * Decorative unless a caller wraps them with text; all carry aria-hidden.
 */
const svg = (body: string, cls = 'icon') =>
  raw(
    `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`,
  );

/** Site mark: three pen-drawn ripples, the lake the neighborhood is named for. */
export const markIcon = raw(
  `<svg class="brand-mark" viewBox="0 0 44 26" width="44" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M2 5c3.5-3 7-3 10.5 0s7 3 10.5 0 7-3 10.5 0 5.5 2.5 8.5 0"/><path d="M2 13c3.5-3 7-3 10.5 0s7 3 10.5 0 7-3 10.5 0 5.5 2.5 8.5 0"/><path d="M2 21c3.5-3 7-3 10.5 0s7 3 10.5 0 7-3 10.5 0 5.5 2.5 8.5 0"/></svg>`,
);

export const arrowRight = svg('<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>', 'icon icon-arrow');
export const star = svg('<path d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/>', 'icon icon-star');
export const check = svg('<path d="M4.5 12.5l4.5 4.5 10.5-11"/>', 'icon icon-check');
export const northArrow = svg('<path d="M12 21V4"/><path d="M7 9l5-5 5 5"/><path d="M8 21h8"/>');
