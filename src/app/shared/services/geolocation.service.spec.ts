import { TestBed } from '@angular/core/testing';

import { GeolocationService } from './geolocation.service';

describe('GeolocationService', () => {
  let service: GeolocationService;
  let originalGeolocation: Geolocation | undefined;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GeolocationService);
    originalGeolocation = navigator.geolocation;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
    });
  });

  it('resolves a GeoPoint from a successful getCurrentPosition callback', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: { latitude: 40.1776, longitude: 44.5126 } as GeolocationCoordinates,
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });

    await expect(service.getCurrentPosition()).resolves.toEqual({ lat: 40.1776, lng: 44.5126 });
  });

  it('rejects with the browser error when permission is denied', async () => {
    const deniedError = { code: 1, message: 'User denied Geolocation' };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          error: (err: GeolocationPositionError) => void,
        ) => {
          error(deniedError as GeolocationPositionError);
        },
      },
    });

    await expect(service.getCurrentPosition()).rejects.toEqual(deniedError);
  });

  it('rejects when navigator.geolocation is unavailable', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });

    await expect(service.getCurrentPosition()).rejects.toThrow(
      'Geolocation is not supported in this environment.',
    );
  });
});
