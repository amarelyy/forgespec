import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom has <dialog> but not showModal()/close().
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
// Not implemented in jsdom
Element.prototype.scrollIntoView ??= () => undefined;
// Not implemented in jsdom: the carousel and walkthrough read the reduced-motion preference.
window.matchMedia ??= ((query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
