import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

interface FaqGroup {
  readonly id: string;
  readonly heading: string;
  readonly items: readonly FaqItem[];
}

const FAQ_GROUPS: readonly FaqGroup[] = [
  {
    id: 'renting',
    heading: 'Renting a Toy',
    items: [
      {
        id: 'r1',
        question: 'How does renting a toy work?',
        answer:
          'Browse the catalogue, find a toy your child will love, and send a rental request to the owner. Choose your preferred dates and add a note if you like. The owner will accept or decline your request. Once accepted, coordinate pickup directly with the owner. Return the toy clean and on time.',
      },
      {
        id: 'r2',
        question: 'How do I search for a toy?',
        answer:
          'Use the search bar on the homepage to find toys by name. On the Browse Toys page you can also filter by category, price range, and age suitability. Browse curated sections like "Popular Toys" and "Most Recent" on the home page.',
      },
      {
        id: 'r4',
        question: 'How does pickup and return work?',
        answer:
          'Pickup and return are arranged directly between the renter and the owner — typically at a convenient location you both agree on. All communication happens through the platform so everything stays on record.',
      },
    ],
  },
  {
    id: 'listing',
    heading: 'Listing a Toy',
    items: [
      {
        id: 'l1',
        question: 'How do I list my toy?',
        answer:
          'Sign in, go to "List a Toy" in the menu, and fill in the toy details: name, description, category, age range, condition, hygiene notes, photos, and daily price. Submit and our team will review it. You\'ll receive an email once approved.',
      },
      {
        id: 'l2',
        question: 'How long does approval take?',
        answer:
          'Most listings are reviewed within 24 hours. You can track the status of your listings under "My Toys." Once approved, your toy becomes visible to all families on the platform.',
      },
      {
        id: 'l3',
        question: 'Can I set my own price?',
        answer:
          'Yes. You choose the daily rental price. We recommend pricing that reflects the toy\'s value and condition.',
      },
      {
        id: 'l4',
        question: 'What toys can I list?',
        answer:
          'Any age-appropriate, safe, and clean toy in reasonable condition. Prohibited items include broken or damaged toys, toys with choking hazards for the listed age group, toys with missing safety certifications, or anything unsuitable for children.',
      },
    ],
  },
  {
    id: 'safety',
    heading: 'Safety & Hygiene',
    items: [
      {
        id: 's1',
        question: 'How do I know a toy is clean?',
        answer:
          'Owners must provide hygiene notes when listing — describing how the toy is cleaned between rentals. All listings go through a manual review, and listings without adequate hygiene information are rejected.',
      },
      {
        id: 's2',
        question: 'What if I receive a damaged or incorrect toy?',
        answer:
          'Please contact us immediately via email if a toy does not match its listing or arrives damaged. We take every report seriously and investigate promptly.',
      },
      {
        id: 's3',
        question: 'Are listings checked for safety?',
        answer:
          'Yes. Our moderation team reviews every new listing for safety, accuracy, and quality before it goes live. We check photos, descriptions, age suitability, and the owner\'s stated condition and hygiene notes.',
      },
    ],
  },
  {
    id: 'payments',
    heading: 'Payments',
    items: [
      {
        id: 'p1',
        question: 'How do payments work?',
        answer:
          'At this stage of the platform, payments are handled directly between the renting family and the listing owner. The platform does not process any financial transactions. Always agree on the amount and method before pickup.',
      },
    ],
  },
  {
    id: 'account',
    heading: 'Accounts & Platform',
    items: [
      {
        id: 'a1',
        question: 'How do I create an account?',
        answer:
          'Click "Sign Up" in the header, provide your name, email address, and a secure password. You\'ll be logged in immediately. An email address is required for listing approvals and booking notifications.',
      },
      {
        id: 'a2',
        question: 'I forgot my password. What do I do?',
        answer:
          'Password reset is coming soon. In the meantime, please contact us via email and we will assist you manually.',
      },
      {
        id: 'a3',
        question: 'How do I contact support?',
        answer:
          'Send us an email at support@dorent.am and we will get back to you as soon as possible. We aim to respond within 1 business day.',
      },
    ],
  },
];

@Component({
  selector: 'app-faq-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './faq-page.component.html',
  styleUrl: './faq-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqPageComponent {
  protected readonly faqGroups = FAQ_GROUPS;
  protected readonly expandedId = signal<string | null>('r1');

  protected toggle(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }
}
