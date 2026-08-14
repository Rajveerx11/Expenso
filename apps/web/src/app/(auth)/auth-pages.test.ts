import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OAuthFailureAlert, oauthCallbackError, oauthRetryPath } from './login/page';
import { EmailConfirmationScreen } from './signup/page';
import { onboardingDestination } from '../onboarding/page';

describe('auth page recovery states', () => {
  it('renders a bounded OAuth callback failure and removes it before retry', () => {
    expect(oauthCallbackError('oauth_failed')).toBe(
      'Sign-in confirmation did not finish. Try again, or sign in with your email and password.',
    );
    expect(oauthCallbackError('<script>alert(1)</script>')).toBe('');
    expect(renderToStaticMarkup(createElement(OAuthFailureAlert))).toContain('role="alert"');
    expect(oauthRetryPath('/login', '?error=oauth_failed&next=%2Fgroups%2F123', '#continue'))
      .toBe('/login?next=%2Fgroups%2F123#continue');
  });

  it('preserves safe first-use destinations and rejects hostile onboarding next values', () => {
    expect(onboardingDestination('?next=%2Fgroups%2F123')).toBe('/groups/123');
    expect(onboardingDestination('?next=%2F%2Fevil.example')).toBe('/dashboard');
  });

  it('renders email confirmation as a terminal screen without resubmission controls', () => {
    const markup = renderToStaticMarkup(createElement(EmailConfirmationScreen, { email: 'person@example.com' }));

    expect(markup).toContain('Check your inbox');
    expect(markup).toContain('person@example.com');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain('Return to Sign In');
    expect(markup).not.toContain('<form');
    expect(markup).not.toContain('<button');
  });
});
