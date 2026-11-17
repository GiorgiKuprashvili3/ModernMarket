export type EmailLocale = 'ka' | 'en';

export interface RenderedEmail {
  subject: string;
  text: string;
}

type Payload = Record<string, unknown>;

const str = (payload: Payload, key: string): string => {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
};

type Renderer = (payload: Payload) => Record<EmailLocale, RenderedEmail>;

// Plain-text templates for now. HTML templates and brand styling come with the notifications milestone.
const TEMPLATES: Record<string, Renderer> = {
  'verify-email': (p) => ({
    ka: {
      subject: 'დაადასტურეთ ელფოსტა — Modernmarket',
      text: `გამარჯობა ${str(p, 'firstName')},\n\nანგარიშის გასააქტიურებლად დააჭირეთ ბმულს:\n${str(p, 'link')}\n\nბმული მოქმედებს 48 საათის განმავლობაში. თუ რეგისტრაცია თქვენ არ გაგივლიათ, უგულებელყავით ეს წერილი.`,
    },
    en: {
      subject: 'Confirm your email — Modernmarket',
      text: `Hello ${str(p, 'firstName')},\n\nOpen this link to activate your account:\n${str(p, 'link')}\n\nThe link is valid for 48 hours. If you did not sign up, you can ignore this email.`,
    },
  }),
  'account-exists': () => ({
    ka: {
      subject: 'Modernmarket — ანგარიში უკვე არსებობს',
      text: 'ამ ელფოსტით Modernmarket-ზე ანგარიში უკვე არსებობს. თუ პაროლი დაგავიწყდათ, გამოიყენეთ „პაროლის აღდგენა“. თუ რეგისტრაცია თქვენ არ სცადეთ, უგულებელყავით ეს წერილი.',
    },
    en: {
      subject: 'Modernmarket — you already have an account',
      text: 'An account already exists for this email on Modernmarket. If you forgot your password, use "Forgot password". If you did not try to sign up, you can ignore this email.',
    },
  }),
  'reset-password': (p) => ({
    ka: {
      subject: 'პაროლის აღდგენა — Modernmarket',
      text: `პაროლის შესაცვლელად გახსენით ბმული:\n${str(p, 'link')}\n\nბმული მოქმედებს 1 საათის განმავლობაში. თუ აღდგენა თქვენ არ მოგითხოვიათ, უგულებელყავით ეს წერილი.`,
    },
    en: {
      subject: 'Reset your password — Modernmarket',
      text: `Open this link to choose a new password:\n${str(p, 'link')}\n\nThe link is valid for 1 hour. If you did not request this, you can ignore this email.`,
    },
  }),
  'seller-application-received': (p) => ({
    ka: {
      subject: 'განაცხადი მიღებულია — Modernmarket',
      text: `თქვენი გამყიდველის განაცხადი (${str(p, 'storeName')}) მიღებულია და განხილვის პროცესშია. შედეგს ელფოსტით შეგატყობინებთ.`,
    },
    en: {
      subject: 'Application received — Modernmarket',
      text: `Your seller application (${str(p, 'storeName')}) has been received and is waiting for review. We will email you the result.`,
    },
  }),
  'seller-approved': (p) => ({
    ka: {
      subject: 'განაცხადი დამტკიცდა — Modernmarket',
      text: `გილოცავთ! თქვენი მაღაზია „${str(p, 'storeName')}“ დამტკიცებულია. ახლა შეგიძლიათ პროდუქტების დამატება (ახალი პროდუქტები გამოქვეყნებამდე მოდერაციას გადის).`,
    },
    en: {
      subject: 'Application approved — Modernmarket',
      text: `Congratulations! Your store "${str(p, 'storeName')}" is approved. You can now add products (new products are reviewed before they are published).`,
    },
  }),
  'seller-rejected': (p) => ({
    ka: {
      subject: 'განაცხადი უარყოფილია — Modernmarket',
      text: `სამწუხაროდ, თქვენი განაცხადი (${str(p, 'storeName')}) ვერ დამტკიცდა.\nმიზეზი: ${str(p, 'reason')}\n\nშეგიძლიათ შეასწოროთ მონაცემები და თავიდან გააგზავნოთ განაცხადი.`,
    },
    en: {
      subject: 'Application not approved — Modernmarket',
      text: `Unfortunately your application (${str(p, 'storeName')}) was not approved.\nReason: ${str(p, 'reason')}\n\nYou can correct your details and apply again.`,
    },
  }),
};

export function renderEmail(template: string, locale: EmailLocale, payload: Payload): RenderedEmail {
  const renderer = TEMPLATES[template];
  if (!renderer) throw new Error(`Unknown email template: ${template}`);
  return renderer(payload)[locale];
}

export const KNOWN_EMAIL_TEMPLATES: readonly string[] = Object.keys(TEMPLATES);
