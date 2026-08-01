import type { FullConfig } from '@playwright/test';

/**
 * M-011 hazard, inverted, for the MOCKED tier (`npm run e2e`, project
 * `chromium`).
 *
 * The real tier already guards itself: every `real/*.spec.ts` file calls
 * `assertDockerStack()` (`support/real-stack.ts`), which hard-fails unless
 * :4200 is the docker nginx UI. But the mocked tier's `webServer` (`npm
 * start`) has `reuseExistingServer: true` locally — it silently reuses
 * *anything* already answering on :4200, including a stale docker `ui`
 * container built from an old commit. When that happened once, all five
 * specs for a brand-new feature failed for a reason that looked like real
 * defects (the bundle under test didn't contain the code being tested).
 *
 * This is the inverse check: when the mocked tier is what's running, refuse
 * to proceed if :4200 is already answering as the docker nginx UI rather
 * than the Angular dev server this tier requires. A per-spec-file call (the
 * real tier's convention) would work too, but it is easy for a future spec
 * file to forget; a single global-setup check protects every mocked spec
 * automatically, including ones not yet written.
 *
 * Skipped when the `real` project is what's being run — it WANTS the docker
 * nginx UI on :4200, and that project's own guard checks the opposite
 * property. Detected from the CLI args the `e2e`/`e2e:real` npm scripts pass
 * straight through to `playwright test`.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const runningRealTierOnly = process.argv.some((arg) => arg.includes('--project=real'));
  if (runningRealTierOnly) return;

  let response: Response;
  try {
    response = await fetch('http://localhost:4200/');
  } catch {
    // Nothing reachable yet — webServer already ran by the time global setup
    // executes, so this would be an unrelated transient issue; let the normal
    // webServer/test failure explain it rather than double-reporting here.
    return;
  }

  const server = (response.headers.get('server') ?? '').toLowerCase();
  if (server.includes('nginx')) {
    throw new Error(
      'Mocked e2e tier (`npm run e2e`): http://localhost:4200 is already serving the ' +
        'docker nginx UI, not the Angular dev server (`ng serve`). Playwright\'s webServer ' +
        'reuses whatever already answers on :4200, so this run would silently test a stale, ' +
        "pre-built docker image instead of your working tree — the exact trap recorded as " +
        'M-011. Stop the docker UI container first (from the repo root), then re-run:\n' +
        '  docker compose -f rental-api/docker-compose.yml stop ui\n' +
        '(or `... down` to stop the whole stack), then `npm run e2e` again.',
    );
  }
}
