import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UpiHandoffPrompt } from './UpiHandoffPrompt';

const handlers = {
  onShowPrompt: vi.fn(),
  onComplete: vi.fn(),
  onCancel: vi.fn(),
};

describe('UPI handoff prompt', () => {
  it('asks an explicit completion question only after return', () => {
    const launching = renderToStaticMarkup(createElement(UpiHandoffPrompt, { state: 'launching', ...handlers }));
    const returned = renderToStaticMarkup(createElement(UpiHandoffPrompt, { state: 'returned', ...handlers }));

    expect(launching).not.toContain('Did you complete this payment?');
    expect(returned).toContain('Did you complete this payment?');
    expect(returned).toContain('Yes, payment completed');
    expect(returned).toContain('Not yet');
    expect(returned).toContain('cannot verify your UPI app result');
  });

  it('keeps completed handoff distinct from submitted claim', () => {
    const completed = renderToStaticMarkup(createElement(UpiHandoffPrompt, { state: 'completed', ...handlers }));

    expect(completed).toContain('Payment marked as completed');
    expect(completed).toContain('Review the claim before submitting');
    expect(completed).not.toContain('claim submitted');
  });
});
