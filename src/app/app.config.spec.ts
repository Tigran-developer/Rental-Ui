import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateLoader } from '@ngx-translate/core';

import { translateHttpLoaderProviders } from './app.config';
import { BUILD_STAMP } from './build-info';

// Regression coverage for the stale-translations bug: production nginx sends
// no Cache-Control for /i18n/*.json, so browsers can keep serving a
// heuristically-cached copy for days after a deploy while index.html/JS are
// correctly busted. The fix is a build-stamped query param on the loader
// request URL, so every build is a brand-new URL no browser has cached.
describe('translateHttpLoaderProviders', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...translateHttpLoaderProviders],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('requests /i18n/{lang}.json with a non-empty ?v= build stamp', () => {
    const loader = TestBed.inject(TranslateLoader);
    const httpMock = TestBed.inject(HttpTestingController);

    loader.getTranslation('en').subscribe();

    const req = httpMock.expectOne(`/i18n/en.json?v=${BUILD_STAMP}`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('BUILD_STAMP is a non-empty value (never renders as a literal "undefined")', () => {
    expect(BUILD_STAMP).toBeTruthy();
    expect(BUILD_STAMP).not.toBe('undefined');
  });
});
