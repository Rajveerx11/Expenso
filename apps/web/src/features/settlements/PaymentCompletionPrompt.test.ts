import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PaymentCompletionPrompt } from './PaymentCompletionPrompt';

describe('payment completion prompt', () => {
  it('requires an explicit result and explains receiver confirmation', () => {
    const rendered = renderToStaticMarkup(createElement(PaymentCompletionPrompt, {
      onComplete: vi.fn(),
      onCancel: vi.fn(),
    }));

    expect(rendered).toContain('What happened in your UPI app?');
    expect(rendered).toContain('Yes, I paid');
    expect(rendered).toContain('Failed or cancelled');
    expect(rendered).toContain('pending claim for the receiver to confirm');
  });
});
