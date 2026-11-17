import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  let service: I18nService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(I18nService);
    http = TestBed.inject(HttpTestingController);
  });

  it('defaults to Georgian and loads its dictionary', async () => {
    const init = service.init();
    http.expectOne('/i18n/ka.json').flush({ hello: 'გამარჯობა' });
    await init;
    expect(service.locale()).toBe('ka');
    expect(service.t('hello')).toBe('გამარჯობა');
  });

  it('falls back to the key when a translation is missing', async () => {
    const init = service.init();
    http.expectOne('/i18n/ka.json').flush({});
    await init;
    expect(service.t('missing.key')).toBe('missing.key');
  });

  it('replaces placeholders', async () => {
    const init = service.init();
    http.expectOne('/i18n/ka.json').flush({ greet: 'Hi {name}' });
    await init;
    expect(service.t('greet', { name: 'Gio' })).toBe('Hi Gio');
  });

  it('switches language', async () => {
    const init = service.init();
    http.expectOne('/i18n/ka.json').flush({ a: 'ka' });
    await init;
    const switching = service.setLocale('en');
    http.expectOne('/i18n/en.json').flush({ a: 'en' });
    await switching;
    expect(service.locale()).toBe('en');
    expect(service.t('a')).toBe('en');
  });
});
