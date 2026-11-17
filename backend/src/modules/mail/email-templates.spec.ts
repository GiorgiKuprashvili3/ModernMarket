import { KNOWN_EMAIL_TEMPLATES, renderEmail } from './email-templates';

describe('email templates', () => {
  it('renders every template in both languages without throwing', () => {
    for (const template of KNOWN_EMAIL_TEMPLATES) {
      for (const locale of ['ka', 'en'] as const) {
        const email = renderEmail(template, locale, { firstName: 'Gio', link: 'http://x/y', storeName: 'S', reason: 'R' });
        expect(email.subject.length).toBeGreaterThan(0);
        expect(email.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('includes the link in link-based emails', () => {
    expect(renderEmail('verify-email', 'en', { firstName: 'A', link: 'http://x/verify?token=1' }).text).toContain(
      'http://x/verify?token=1',
    );
    expect(renderEmail('reset-password', 'ka', { link: 'http://x/reset?token=2' }).text).toContain('http://x/reset?token=2');
  });

  it('throws for an unknown template', () => {
    expect(() => renderEmail('nope', 'en', {})).toThrow(/Unknown email template/);
  });
});
