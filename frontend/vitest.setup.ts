import '@testing-library/jest-dom';
import { vi } from 'vitest';

// JSDOM no implementa scrollIntoView. Lo definimos manualmente
// para evitar errores en los tests que renderizan componentes con auto-scroll.
if (typeof window !== 'undefined' && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = function() {};
}
