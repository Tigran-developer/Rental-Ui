import { AsyncPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  effect,
  signal,
  inject,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Store, createSelector } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';

import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { LoadingSkeletonComponent } from '../../../../shared/ui/loading-skeleton/loading-skeleton.component';
import { AuthDialogComponent } from '../../../auth/components/auth-dialog/auth-dialog.component';
import { selectIsAuthenticated } from '../../../auth/store/auth.selectors';
import { selectFavoriteIds } from '../../../favorites/store/favorites.selectors';
import type { ListingCategoryOption } from '../../../listings/models/create-listing.model';
import * as ListingsActions from '../../../listings/store/listings.actions';
import {
  selectListingCategories,
  selectListingCategoriesLoading,
} from '../../../listings/store/listings.selectors';
import { ListingCardComponent } from '../../../listings/components/listing-card/listing-card.component';
import { MyListingsApiService } from '../../../my-listings/services/my-listings-api.service';
import type { HomeSectionResponse } from '../../models/home-section.model';
import { HomeSectionsActions } from '../../store/home.actions';
import {
  selectHomeSections,
  selectHomeSectionsError,
  selectHomeSectionsLoading,
} from '../../store/home.selectors';
import {
  CategoryTileComponent,
  type HomeCategoryTileVm,
} from '../../components/category-tile/category-tile.component';
import { SectionHeaderComponent } from '../../../../shared/ui/section-header/section-header.component';
import { UiInputComponent } from '../../../../shared/ui/input/ui-input.component';
import { HeaderSearchVisibilityService } from '../../../../shared/ui/app-header/header-search-visibility.service';
import { LanguageSelectorComponent } from '../../../../shared/ui/language-selector/language-selector.component';
import { DorentSymbolComponent } from '../../../../shared/ui/dorent-symbol/dorent-symbol.component';

type ProcessMode = 'renting' | 'lending';

interface CategoryVisual {
  readonly icon: string;
  readonly tintA: string;
  readonly tintB: string;
}

interface HomeFaqEntry {
  readonly id: string;
  readonly questionKey: string;
  readonly answerKey: string;
}

interface HomeProcessStep {
  readonly id: string;
  readonly icon: string;
  readonly titleKeyRenting: string;
  readonly descKeyRenting: string;
  readonly titleKeyLending: string;
  readonly descKeyLending: string;
}

interface HomePageViewModel {
  readonly categories: HomeCategoryTileVm[];
  readonly showCategoriesSkeleton: boolean;
  readonly showCategoriesEmpty: boolean;
  readonly isAuthenticated: boolean;
  readonly sections: HomeSectionResponse[];
  readonly sectionsLoading: boolean;
  readonly sectionsError: string | null;
}

const DEFAULT_VISUAL: CategoryVisual = {
  icon: 'pi pi-tag',
  tintA: '#2a2c41',
  tintB: '#7b7a7a',
};

/**
 * Slug -> PrimeIcon + gradient tint mapping used when the API returns
 * categories without image URLs.
 */
const CATEGORY_VISUALS: Readonly<Record<string, CategoryVisual>> = {
  construction: {
    icon: 'pi pi-wrench',
    tintA: '#ff6008',
    tintB: '#fd8b47',
  },
  'construction-equipment-tools': {
    icon: 'pi pi-wrench',
    tintA: '#ff6008',
    tintB: '#fd8b47',
  },
  tools: { icon: 'pi pi-wrench', tintA: '#ff6008', tintB: '#fd8b47' },
  electronics: { icon: 'pi pi-bolt', tintA: '#2a2c41', tintB: '#4a4d6f' },
  film: { icon: 'pi pi-camera', tintA: '#8b5cf6', tintB: '#6366f1' },
  'film-photography': {
    icon: 'pi pi-camera',
    tintA: '#8b5cf6',
    tintB: '#6366f1',
  },
  photography: { icon: 'pi pi-camera', tintA: '#8b5cf6', tintB: '#6366f1' },
  garden: { icon: 'pi pi-sun', tintA: '#15803d', tintB: '#65a30d' },
  home: { icon: 'pi pi-home', tintA: '#0e7490', tintB: '#0284c7' },
  party: { icon: 'pi pi-gift', tintA: '#db2777', tintB: '#ec4899' },
  sports: { icon: 'pi pi-star', tintA: '#b91c1c', tintB: '#ef4444' },
  'sports-hobbies': {
    icon: 'pi pi-star',
    tintA: '#b91c1c',
    tintB: '#ef4444',
  },
  hobbies: { icon: 'pi pi-star', tintA: '#b91c1c', tintB: '#ef4444' },
  vehicle: { icon: 'pi pi-car', tintA: '#1f2937', tintB: '#374151' },
  vehicles: { icon: 'pi pi-car', tintA: '#1f2937', tintB: '#374151' },
  premises: { icon: 'pi pi-building', tintA: '#0f766e', tintB: '#14b8a6' },
  permises: { icon: 'pi pi-building', tintA: '#0f766e', tintB: '#14b8a6' },
  other: { icon: 'pi pi-tag', tintA: '#475569', tintB: '#64748b' },
  apartment: { icon: 'pi pi-building', tintA: '#0f766e', tintB: '#14b8a6' },
  house: { icon: 'pi pi-home', tintA: '#0e7490', tintB: '#0284c7' },
  villa: { icon: 'pi pi-star', tintA: '#b45309', tintB: '#f59e0b' },
  studio: { icon: 'pi pi-box', tintA: '#4c1d95', tintB: '#7c3aed' },
  cabin: { icon: 'pi pi-compass', tintA: '#78350f', tintB: '#b45309' },
};

const PROCESS_STEPS: readonly HomeProcessStep[] = [
  {
    id: 'step1',
    icon: 'pi pi-user',
    titleKeyRenting: 'home.process.renting.step1.title',
    descKeyRenting: 'home.process.renting.step1.text',
    titleKeyLending: 'home.process.lending.step1.title',
    descKeyLending: 'home.process.lending.step1.text',
  },
  {
    id: 'step2',
    icon: 'pi pi-search',
    titleKeyRenting: 'home.process.renting.step2.title',
    descKeyRenting: 'home.process.renting.step2.text',
    titleKeyLending: 'home.process.lending.step2.title',
    descKeyLending: 'home.process.lending.step2.text',
  },
  {
    id: 'step3',
    icon: 'pi pi-calendar',
    titleKeyRenting: 'home.process.renting.step3.title',
    descKeyRenting: 'home.process.renting.step3.text',
    titleKeyLending: 'home.process.lending.step3.title',
    descKeyLending: 'home.process.lending.step3.text',
  },
  {
    id: 'step4',
    icon: 'pi pi-send',
    titleKeyRenting: 'home.process.renting.step4.title',
    descKeyRenting: 'home.process.renting.step4.text',
    titleKeyLending: 'home.process.lending.step4.title',
    descKeyLending: 'home.process.lending.step4.text',
  },
  {
    id: 'step5',
    icon: 'pi pi-check-circle',
    titleKeyRenting: 'home.process.renting.step5.title',
    descKeyRenting: 'home.process.renting.step5.text',
    titleKeyLending: 'home.process.lending.step5.title',
    descKeyLending: 'home.process.lending.step5.text',
  },
  {
    id: 'step6',
    icon: 'pi pi-star',
    titleKeyRenting: 'home.process.renting.step6.title',
    descKeyRenting: 'home.process.renting.step6.text',
    titleKeyLending: 'home.process.lending.step6.title',
    descKeyLending: 'home.process.lending.step6.text',
  },
];

/**
 * Offset roughly equal to the sticky header height, so the header search only
 * takes over once the hero search has passed *behind* the header rather than
 * merely touching the viewport edge.
 */
const HERO_SEARCH_ROOT_MARGIN = '-80px 0px 0px 0px';

const FAQ_ENTRIES: readonly HomeFaqEntry[] = [
  {
    id: 'q1',
    questionKey: 'home.faq.items.q1.question',
    answerKey: 'home.faq.items.q1.answer',
  },
  {
    id: 'q2',
    questionKey: 'home.faq.items.q2.question',
    answerKey: 'home.faq.items.q2.answer',
  },
  {
    id: 'q3',
    questionKey: 'home.faq.items.q3.question',
    answerKey: 'home.faq.items.q3.answer',
  },
  {
    id: 'q4',
    questionKey: 'home.faq.items.q4.question',
    answerKey: 'home.faq.items.q4.answer',
  },
  {
    id: 'q5',
    questionKey: 'home.faq.items.q5.question',
    answerKey: 'home.faq.items.q5.answer',
  },
  {
    id: 'q6',
    questionKey: 'home.faq.items.q6.question',
    answerKey: 'home.faq.items.q6.answer',
  },
];

interface HomeSource {
  readonly categories: ListingCategoryOption[];
  readonly categoriesLoading: boolean;
  readonly isAuthenticated: boolean;
}

const selectHomeSource = createSelector(
  selectListingCategories,
  selectListingCategoriesLoading,
  selectIsAuthenticated,
  (categories, categoriesLoading, isAuthenticated): HomeSource => ({
    categories,
    categoriesLoading,
    isAuthenticated,
  }),
);

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    AuthDialogComponent,
    EmptyStateComponent,
    ListingCardComponent,
    LoadingSkeletonComponent,
    CategoryTileComponent,
    SectionHeaderComponent,
    UiInputComponent,
    LanguageSelectorComponent,
    DorentSymbolComponent,
  ],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly myListingsApi = inject(MyListingsApiService);
  private readonly headerSearchVisibility = inject(HeaderSearchVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly heroSearchRef =
    viewChild<ElementRef<HTMLElement>>('heroSearch');
  private heroSearchObserver: IntersectionObserver | null = null;

  protected readonly processSteps = PROCESS_STEPS;
  protected readonly faqEntries = FAQ_ENTRIES;

  protected readonly isAuthenticated = this.store.selectSignal(selectIsAuthenticated);
  protected readonly showAuthDialog = signal(false);

  protected readonly myListingIds = toSignal(
    toObservable(this.isAuthenticated).pipe(
      switchMap((isAuth) =>
        isAuth
          ? this.myListingsApi
              .getMyListings()
              .pipe(map((listings) => new Set(listings.map((l) => l.id))))
          : of(new Set<string>()),
      ),
    ),
    { initialValue: new Set<string>() },
  );

  /**
   * True while the hero search is on screen and the revealed search (header
   * pill on desktop, the fixed bar on mobile) must stay hidden. Read back from
   * the shared service so both surfaces are driven by the one observer below
   * rather than by two competing mechanisms.
   */
  protected readonly headerSearchHidden = this.headerSearchVisibility.hidden;

  protected readonly processMode = signal<ProcessMode>('renting');
  protected readonly expandedFaq = signal<string | null>('q1');

  protected readonly searchForm = this.fb.nonNullable.group({
    query: this.fb.nonNullable.control(''),
  });

  protected readonly viewModel$: Observable<HomePageViewModel> = combineLatest([
    this.store.select(selectHomeSource),
    this.store.select(selectHomeSections),
    this.store.select(selectHomeSectionsLoading),
    this.store.select(selectHomeSectionsError),
    this.store.select(selectFavoriteIds),
  ]).pipe(
    map(([source, sections, sectionsLoading, sectionsError, favoriteIds]): HomePageViewModel => {
      const mappedCategories: HomeCategoryTileVm[] = source.categories.map(
        (category): HomeCategoryTileVm => {
          const visual =
            CATEGORY_VISUALS[category.slug.toLowerCase()] ?? DEFAULT_VISUAL;
          return {
            id: category.id,
            slug: category.slug,
            label: category.name,
            imageUrl: category.imageUrl ?? null,
            iconName: category.iconName ?? null,
            icon: visual.icon,
            tintA: visual.tintA,
            tintB: visual.tintB,
          };
        },
      );

      return {
        categories: mappedCategories,
        showCategoriesSkeleton:
          source.categoriesLoading && mappedCategories.length === 0,
        showCategoriesEmpty:
          !source.categoriesLoading && mappedCategories.length === 0,
        isAuthenticated: source.isAuthenticated,
        sections: sections.map((s) => ({
          ...s,
          items: s.items.map((i) => ({ ...i, isFavorite: favoriteIds.has(i.id) })),
        })),
        sectionsLoading,
        sectionsError,
      };
    }),
  );

  constructor() {
    // The hero owns the search field while it is on screen; once it scrolls
    // out from under the sticky header the header search fades in. The hero
    // markup sits inside an `@if`, so the element arrives asynchronously and
    // the observer is (re)attached from an effect on the view query.
    effect(() => {
      const element = this.heroSearchRef()?.nativeElement ?? null;

      this.disconnectHeroSearchObserver();

      if (element === null || typeof IntersectionObserver === 'undefined') {
        return;
      }

      // Home always loads at the top, where the hero search is visible — hide
      // the header search up front so it cannot flash before the first
      // observer callback lands.
      this.headerSearchVisibility.setHidden(true);

      const observer = new IntersectionObserver(
        ([entry]) => this.headerSearchVisibility.setHidden(entry.isIntersecting),
        { threshold: 0, rootMargin: HERO_SEARCH_ROOT_MARGIN },
      );
      observer.observe(element);
      this.heroSearchObserver = observer;
    });

    this.destroyRef.onDestroy(() => {
      this.disconnectHeroSearchObserver();
      // Leaving Home must restore the always-visible header search.
      this.headerSearchVisibility.reset();
    });
  }

  ngOnInit(): void {
    this.store.dispatch(ListingsActions.loadListingCategories());
    this.store.dispatch(HomeSectionsActions.load());
  }

  private disconnectHeroSearchObserver(): void {
    this.heroSearchObserver?.disconnect();
    this.heroSearchObserver = null;
  }

  protected onSearchSubmit(): void {
    const raw = this.searchForm.controls.query.value.trim();
    void this.router.navigate(['/listings'], {
      queryParams: raw ? { q: raw } : {},
    });
  }

  protected onCategorySelect(category: HomeCategoryTileVm): void {
    void this.router.navigate(['/listings'], { queryParams: { categoryId: category.id } });
  }

  protected onExploreCtaClick(): void {
    void this.router.navigate(['/listings']);
  }

  protected onFavoriteToggle(listingId: string): void {
    if (!this.isAuthenticated()) {
      this.showAuthDialog.set(true);
      return;
    }
    this.store.dispatch(ListingsActions.toggleFavoriteOptimistic({ listingId }));
  }

  protected setProcessMode(mode: ProcessMode): void {
    this.processMode.set(mode);
  }

  protected toggleFaq(id: string): void {
    this.expandedFaq.update((current) => (current === id ? null : id));
  }

  protected retryHomeSections(): void {
    this.store.dispatch(HomeSectionsActions.load());
  }

  protected scrollCarousel(carousel: HTMLElement, direction: -1 | 1): void {
    const amount = carousel.clientWidth * 0.8;
    carousel.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }
}
