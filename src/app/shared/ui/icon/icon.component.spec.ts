import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IconComponent } from './icon.component';

// Names added for the admin console (Phase 0 foundations). `dots`, `sort`,
// `trash` were authored locally — see the header comment above their entries
// in icon.component.ts for why (the source design file's Icon set does not
// define them).
const ADMIN_CONSOLE_ICON_NAMES = [
  'tag',
  'truck',
  'sparkle',
  'flag',
  'user',
  'dots',
  'sort',
  'trash',
  'clock',
  'verified',
  'arrow',
  'chevron',
  'chevronL',
  'chevronD',
  'image',
  'lock',
  'glob',
  'clean',
  'home',
  'pin',
] as const;

// A spec asserting non-empty markup alone would not have caught the
// Phase-0 bug where `dots`/`verified` (filled glyphs) rendered invisible —
// `IconComponent`'s template hardcodes `fill="none"` on the outer `<svg>`,
// so any shape the design draws *filled* only paints if it carries its own
// explicit `fill="currentColor"`. Assert that directly for the filled ones.
const FILLED_ICON_NAMES = ['dots', 'verified'] as const;

describe('IconComponent — admin console glyph set', () => {
  let fixture: ComponentFixture<IconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(IconComponent);
  });

  for (const name of ADMIN_CONSOLE_ICON_NAMES) {
    it(`resolves non-empty markup for "${name}"`, () => {
      fixture.componentRef.setInput('name', name);
      fixture.detectChanges();
      const svg: SVGSVGElement = fixture.nativeElement.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg.innerHTML.trim().length).toBeGreaterThan(0);
    });
  }

  for (const name of FILLED_ICON_NAMES) {
    it(`"${name}" carries an explicit fill (would be invisible against the host svg's fill="none")`, () => {
      fixture.componentRef.setInput('name', name);
      fixture.detectChanges();
      const svg: SVGSVGElement = fixture.nativeElement.querySelector('svg');
      const filledShapes = svg.querySelectorAll('[fill]:not([fill="none"])');
      expect(filledShapes.length).toBeGreaterThan(0);
    });
  }
});
