import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DangerButton, OutlineButton, PrimaryButton, SecondaryButton } from './Buttons';

describe('button loading state', () => {
  it.each([
    ['primary', PrimaryButton],
    ['secondary', SecondaryButton],
    ['danger', DangerButton],
    ['outline', OutlineButton],
  ] as const)('keeps the %s button disabled while loading', (_name, Button) => {
    const html = renderToStaticMarkup(<Button loading disabled={false}>Save</Button>);

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });
});
