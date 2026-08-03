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

  function stubGeolocation(value: unknown): void {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value });
  }

  it('requests the FIRST fix with high accuracy and no cached fallback (the fix: enableHighAccuracy true, maximumAge 0)', async () => {
    const getCurrentPosition = vi.fn(
      (success: PositionCallback, _error?: PositionErrorCallback, _options?: PositionOptions) => {
        success({
          coords: {
            latitude: 40.1776,
            longitude: 44.5126,
            accuracy: 12,
          } as GeolocationCoordinates,
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    );
    stubGeolocation({ getCurrentPosition });

    await service.getCurrentPosition();

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    const options = getCurrentPosition.mock.calls[0][2] as PositionOptions;
    expect(options.enableHighAccuracy).toBe(true);
    expect(options.maximumAge).toBe(0);
  });

  it('resolves a GeolocatedPoint with accuracyMeters taken straight from coords.accuracy', async () => {
    stubGeolocation({
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: {
            latitude: 40.1776,
            longitude: 44.5126,
            accuracy: 8.4,
          } as GeolocationCoordinates,
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    });

    await expect(service.getCurrentPosition()).resolves.toEqual({
      lat: 40.1776,
      lng: 44.5126,
      accuracyMeters: 8.4,
    });
  });

  it('normalizes a missing/non-finite coords.accuracy to null rather than NaN/undefined', async () => {
    stubGeolocation({
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: { latitude: 40.1776, longitude: 44.5126 } as GeolocationCoordinates,
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    });

    await expect(service.getCurrentPosition()).resolves.toEqual({
      lat: 40.1776,
      lng: 44.5126,
      accuracyMeters: null,
    });
  });

  it('retries once in the cheap/cached mode when the high-accuracy request times out (code 3)', async () => {
    const timeoutError = { code: 3, message: 'Timeout expired' };
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        error: (err: GeolocationPositionError) => void,
        options: PositionOptions,
      ) => {
        if (options.enableHighAccuracy) {
          error(timeoutError as GeolocationPositionError);
          return;
        }
        success({
          coords: { latitude: 40.2, longitude: 44.55, accuracy: 900 } as GeolocationCoordinates,
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    );
    stubGeolocation({ getCurrentPosition });

    await expect(service.getCurrentPosition()).resolves.toEqual({
      lat: 40.2,
      lng: 44.55,
      accuracyMeters: 900,
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    const retryOptions = getCurrentPosition.mock.calls[1][2] as PositionOptions;
    expect(retryOptions.enableHighAccuracy).toBe(false);
    expect(retryOptions.maximumAge).toBe(60_000);
  });

  it('retries once in the cheap/cached mode when the high-accuracy request reports POSITION_UNAVAILABLE (code 2)', async () => {
    const unavailableError = { code: 2, message: 'Position unavailable' };
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        error: (err: GeolocationPositionError) => void,
        options: PositionOptions,
      ) => {
        if (options.enableHighAccuracy) {
          error(unavailableError as GeolocationPositionError);
          return;
        }
        success({
          coords: { latitude: 40.2, longitude: 44.55, accuracy: 1500 } as GeolocationCoordinates,
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    );
    stubGeolocation({ getCurrentPosition });

    await expect(service.getCurrentPosition()).resolves.toEqual({
      lat: 40.2,
      lng: 44.55,
      accuracyMeters: 1500,
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('rejects with whatever the retry itself reports, without a second retry', async () => {
    const timeoutError = { code: 3, message: 'Timeout expired' };
    const retryError = { code: 2, message: 'Still unavailable' };
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        error: (err: GeolocationPositionError) => void,
        options: PositionOptions,
      ) => {
        if (options.enableHighAccuracy) {
          error(timeoutError as GeolocationPositionError);
          return;
        }
        error(retryError as GeolocationPositionError);
      },
    );
    stubGeolocation({ getCurrentPosition });

    await expect(service.getCurrentPosition()).rejects.toEqual(retryError);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('rejects immediately with NO retry when permission is denied (code 1)', async () => {
    const deniedError = { code: 1, message: 'User denied Geolocation' };
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error: (err: GeolocationPositionError) => void) => {
        error(deniedError as GeolocationPositionError);
      },
    );
    stubGeolocation({ getCurrentPosition });

    await expect(service.getCurrentPosition()).rejects.toEqual(deniedError);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('rejects when navigator.geolocation is unavailable, with no call at all (no retry possible)', async () => {
    stubGeolocation(undefined);

    await expect(service.getCurrentPosition()).rejects.toThrow(
      'Geolocation is not supported in this environment.',
    );
  });
});
