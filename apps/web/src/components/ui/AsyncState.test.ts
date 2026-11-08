import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundRefreshError, queryErrorPresentation } from './AsyncState';

describe('query error presentation', () => {
  it('keeps loaded data visible when a background refetch fails', () => {
    const error = new Error('refetch failed');

    expect(queryErrorPresentation(error, true)).toBe('background');
    expect(queryErrorPresentation(error, false)).toBe('blocking');
    expect(queryErrorPresentation(null, true)).toBe('none');
  });

  it('renders an accessible non-destructive retry warning', () => {
    const html = renderToStaticMarkup(createElement(BackgroundRefreshError, {
      message: 'Latest values are unavailable.',
      retry: vi.fn(),
    }));

    expect(html).toContain('role="alert"');
    expect(html).toContain('Showing saved data');
    expect(html).toContain('Latest values are unavailable.');
    expect(html).toContain('>Retry</button>');
  });
});
