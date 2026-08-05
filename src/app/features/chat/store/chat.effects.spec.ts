import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { actionsHarness, collect } from '../../../../testing/ngrx.helpers';
import { selectAuthUser } from '../../auth/store/auth.selectors';
import type {
  ChatConversationDetails,
  ChatMessage,
  ChatRealtimeMessage,
} from '../models/chat.model';
import { ChatBadgeService } from '../services/chat-badge.service';
import { ChatApiService } from '../services/chat-api.service';
import * as ChatActions from './chat.actions';
import { ChatEffects } from './chat.effects';
import { selectActiveConversation } from './chat.selectors';

function makeRealtimeMessage(overrides: Partial<ChatRealtimeMessage> = {}): ChatRealtimeMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'owner-1',
    senderName: 'Owner',
    type: 'text',
    systemKind: null,
    body: 'Hello',
    attachmentUrl: null,
    sentAt: '2026-07-08T10:00:00.000Z',
    ...overrides,
  };
}

function makeActiveConversation(
  overrides: Partial<ChatConversationDetails> = {},
): ChatConversationDetails {
  return {
    id: 'c1',
    bookingId: 'b1',
    counterpartId: 'owner-1',
    counterpartName: 'Owner',
    counterpartAvatarUrl: null,
    counterpartVerified: false,
    toyTitle: 'Wooden Train',
    toyImageUrl: null,
    status: 'active',
    bookingDates: 'Jul 1 – Jul 3',
    bookingPrice: 10,
    isClosed: false,
    messages: [],
    ...overrides,
  };
}

/** The real en.json strings for the keys the chat error map resolves to. */
const TRANSLATIONS: Record<string, string> = {
  'chat.details.imageInvalidType': 'Unsupported file type. Use a JPEG, PNG, WebP or GIF image.',
  'chat.details.imageTooLarge': 'This photo is too large. Maximum size is {{max}} MB.',
};

function translateStub(): Pick<TranslateService, 'instant'> {
  return {
    instant: ((key: string, params?: Record<string, unknown>) => {
      const value = TRANSLATIONS[key] ?? key;
      return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ''));
    }) as TranslateService['instant'],
  };
}

/**
 * A ProblemDetails error exactly as the API returns it: the bare ServiceError code lives in
 * `errorCode`, while `type` is the non-dereferenceable `urn:rental:error:<code>` URI reference
 * RFC 7807 requires. Callers may override `type` to pin that nothing parses the URN.
 */
function problemDetails(
  status: number,
  code: string,
  title: string,
  type = `urn:rental:error:${code}`,
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { status, type, title, errorCode: code },
  });
}

function setup(chatApi: Partial<ChatApiService> = {}) {
  const harness = actionsHarness();
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  const messageService = { add: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      ChatEffects,
      harness.provider,
      provideMockStore(),
      { provide: ChatApiService, useValue: chatApi },
      { provide: ChatBadgeService, useValue: { setUnreadCount: vi.fn() } },
      { provide: TranslateService, useValue: translateStub() },
      { provide: Router, useValue: router },
      { provide: MessageService, useValue: messageService },
    ],
  });
  const store = TestBed.inject(MockStore);
  store.overrideSelector(selectAuthUser, { id: 'renter-1' } as never);
  store.overrideSelector(selectActiveConversation, makeActiveConversation());
  return {
    harness,
    store,
    effects: TestBed.inject(ChatEffects),
    router,
    messageService,
  };
}

describe('ChatEffects', () => {
  describe('sendImageMessage$', () => {
    it('uploads the file and revokes the optimistic preview URL on success', async () => {
      const message: ChatMessage = {
        id: 'img-1',
        conversationId: 'c1',
        senderId: 'renter-1',
        senderName: 'Ada',
        type: 'image',
        systemKind: null,
        body: 'Hi',
        attachmentUrl: '/uploads/chat/c1/photo.jpg',
        sentAt: '2026-07-08T10:00:00.000Z',
        isMine: true,
        seen: false,
      };
      const sendImageMessage = vi.fn(() => of(message));
      const { harness, effects } = setup({
        sendImageMessage,
      } as unknown as Partial<ChatApiService>);
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

      const result = collect(effects.sendImageMessage$);
      const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
      harness.send(
        ChatActions.sendImageMessage({
          conversationId: 'c1',
          file,
          caption: 'Hi',
          previewUrl: 'blob:preview',
        }),
      );
      harness.complete();

      const emitted = await result;
      expect(sendImageMessage).toHaveBeenCalledWith('c1', file, 'Hi');
      expect(emitted).toEqual([ChatActions.sendImageMessageSuccess({ message })]);
      expect(revoke).toHaveBeenCalledWith('blob:preview');
      revoke.mockRestore();
    });

    it('maps a rejected upload to sendImageMessageFailure', async () => {
      const { harness, effects } = setup({
        sendImageMessage: vi.fn(() => throwError(() => new Error('Attachment too large'))),
      } as unknown as Partial<ChatApiService>);

      const result = collect(effects.sendImageMessage$);
      harness.send(
        ChatActions.sendImageMessage({
          conversationId: 'c1',
          file: new File(['x'], 'p.jpg', { type: 'image/jpeg' }),
          caption: null,
          previewUrl: 'blob:preview',
        }),
      );
      harness.complete();

      const emitted = await result;
      expect(emitted).toEqual([
        ChatActions.sendImageMessageFailure({ error: 'Attachment too large' }),
      ]);
    });

    // A text file renamed to .jpg reports `File.type === "image/jpeg"`, so the
    // composer's client-side pre-check passes it and only the server's
    // magic-byte validation rejects it. That rejection must still be translated
    // rather than showing the server's hardcoded-English ProblemDetails title.
    it('translates a server chat.attachment_invalid_type rejection instead of showing the raw server title', async () => {
      const { harness, effects } = setup({
        sendImageMessage: vi.fn(() =>
          throwError(() =>
            problemDetails(
              400,
              'chat.attachment_invalid_type',
              'File is not a valid or supported image.',
            ),
          ),
        ),
      } as unknown as Partial<ChatApiService>);

      const result = collect(effects.sendImageMessage$);
      harness.send(
        ChatActions.sendImageMessage({
          conversationId: 'c1',
          file: new File(['plain text'], 'notes.jpg', { type: 'image/jpeg' }),
          caption: null,
          previewUrl: 'blob:preview',
        }),
      );
      harness.complete();

      const emitted = await result;
      expect(emitted).toEqual([
        ChatActions.sendImageMessageFailure({
          error: 'Unsupported file type. Use a JPEG, PNG, WebP or GIF image.',
        }),
      ]);
      const [failure] = emitted as [ReturnType<typeof ChatActions.sendImageMessageFailure>];
      expect(failure.error).not.toContain('File is not a valid or supported image.');
    });

    it('translates a server chat.attachment_too_large rejection with the size limit', async () => {
      const { harness, effects } = setup({
        sendImageMessage: vi.fn(() =>
          throwError(() =>
            problemDetails(400, 'chat.attachment_too_large', 'Attachment exceeds 5 MB.'),
          ),
        ),
      } as unknown as Partial<ChatApiService>);

      const result = collect(effects.sendImageMessage$);
      harness.send(
        ChatActions.sendImageMessage({
          conversationId: 'c1',
          file: new File(['x'], 'big.jpg', { type: 'image/jpeg' }),
          caption: null,
          previewUrl: 'blob:preview',
        }),
      );
      harness.complete();

      const emitted = await result;
      expect(emitted).toEqual([
        ChatActions.sendImageMessageFailure({
          error: 'This photo is too large. Maximum size is 5 MB.',
        }),
      ]);
    });

    // Regression guard: `type` is an opaque URN, `errorCode` is the contract. Here the two
    // deliberately disagree — a reader that parses the URN out of `type` would resolve
    // "too large", so only an `errorCode` reader can produce the "invalid type" message.
    // Pins the fix for the day someone "helpfully" starts splitting `type` on ':' again.
    it('maps off `errorCode`, not the `type` URN, when the two disagree', async () => {
      const { harness, effects } = setup({
        sendImageMessage: vi.fn(() =>
          throwError(() =>
            problemDetails(
              400,
              'chat.attachment_invalid_type',
              'File is not a valid or supported image.',
              'urn:rental:error:chat.attachment_too_large',
            ),
          ),
        ),
      } as unknown as Partial<ChatApiService>);

      const result = collect(effects.sendImageMessage$);
      harness.send(
        ChatActions.sendImageMessage({
          conversationId: 'c1',
          file: new File(['plain text'], 'notes.jpg', { type: 'image/jpeg' }),
          caption: null,
          previewUrl: 'blob:preview',
        }),
      );
      harness.complete();

      const emitted = await result;
      expect(emitted).toEqual([
        ChatActions.sendImageMessageFailure({
          error: 'Unsupported file type. Use a JPEG, PNG, WebP or GIF image.',
        }),
      ]);
    });
  });

  describe('realtimeMessageReceived$', () => {
    it('re-fetches conversation details for a SYSTEM message in the open thread (M-007)', async () => {
      const { harness, store, effects } = setup();
      store.overrideSelector(selectActiveConversation, makeActiveConversation({ id: 'c1' }));
      store.refreshState();

      const result = collect(effects.realtimeMessageReceived$);
      harness.send(
        ChatActions.realtimeMessageReceived({
          message: makeRealtimeMessage({
            id: 'sys-1',
            type: 'system',
            systemKind: 'closed',
            senderId: null,
            body: 'The rental is complete.',
          }),
        }),
      );
      harness.complete();

      const emitted = await result;
      expect(
        emitted.some(
          (action) =>
            action.type === ChatActions.loadConversationDetails.type &&
            (action as { conversationId: string }).conversationId === 'c1',
        ),
      ).toBe(true);
      // The resolved message is still appended alongside the re-fetch.
      expect(
        emitted.some((action) => action.type === ChatActions.realtimeMessageResolved.type),
      ).toBe(true);
    });

    it('does NOT re-fetch details for an ordinary TEXT message', async () => {
      const { harness, store, effects } = setup();
      store.overrideSelector(selectActiveConversation, makeActiveConversation({ id: 'c1' }));
      store.refreshState();

      const result = collect(effects.realtimeMessageReceived$);
      harness.send(
        ChatActions.realtimeMessageReceived({
          message: makeRealtimeMessage({ type: 'text' }),
        }),
      );
      harness.complete();

      const emitted = await result;
      expect(
        emitted.some((action) => action.type === ChatActions.loadConversationDetails.type),
      ).toBe(false);
    });

    it('does NOT re-fetch details for a SYSTEM message in a NON-open conversation', async () => {
      const { harness, store, effects } = setup();
      store.overrideSelector(
        selectActiveConversation,
        makeActiveConversation({ id: 'other-conversation' }),
      );
      store.refreshState();

      const result = collect(effects.realtimeMessageReceived$);
      harness.send(
        ChatActions.realtimeMessageReceived({
          message: makeRealtimeMessage({
            id: 'sys-2',
            conversationId: 'c1',
            type: 'system',
            systemKind: 'closed',
          }),
        }),
      );
      harness.complete();

      const emitted = await result;
      expect(
        emitted.some((action) => action.type === ChatActions.loadConversationDetails.type),
      ).toBe(false);
    });
  });

  describe('openConversationFromBooking$', () => {
    it('maps a successful open/create to openConversationFromBookingSuccess', async () => {
      const conversation = makeActiveConversation({ id: 'c-from-booking' });
      const getOrCreateFromBooking = vi.fn(() => of(conversation));
      const { harness, effects } = setup({
        getOrCreateFromBooking,
      } as unknown as Partial<ChatApiService>);

      const result = collect(effects.openConversationFromBooking$);
      harness.send(ChatActions.openConversationFromBooking({ bookingId: 'b1' }));
      harness.complete();

      expect(await result).toEqual([
        ChatActions.openConversationFromBookingSuccess({ conversation }),
      ]);
      expect(getOrCreateFromBooking).toHaveBeenCalledWith('b1');
    });

    it('maps a failure to openConversationFromBookingFailure', async () => {
      const { harness, effects } = setup({
        getOrCreateFromBooking: vi.fn(() => throwError(() => new Error('nope'))),
      } as unknown as Partial<ChatApiService>);

      const result = collect(effects.openConversationFromBooking$);
      harness.send(ChatActions.openConversationFromBooking({ bookingId: 'b1' }));
      harness.complete();

      expect(await result).toEqual([
        ChatActions.openConversationFromBookingFailure({ error: 'nope' }),
      ]);
    });
  });

  describe('navigateAfterOpenConversationFromBooking$', () => {
    it('navigates to the opened thread', async () => {
      const { harness, effects, router } = setup();

      const result = collect(effects.navigateAfterOpenConversationFromBooking$);
      harness.send(
        ChatActions.openConversationFromBookingSuccess({
          conversation: makeActiveConversation({ id: 'c-from-booking' }),
        }),
      );
      harness.complete();
      await result;

      expect(router.navigate).toHaveBeenCalledWith(['/chat', 'c-from-booking']);
    });
  });

  describe('openConversationFromBookingErrorToast$', () => {
    it('shows an error toast so a failed "Message owner" click is never silent', async () => {
      const { harness, effects, messageService } = setup();

      const result = collect(effects.openConversationFromBookingErrorToast$);
      harness.send(
        ChatActions.openConversationFromBookingFailure({ error: 'Could not reach server' }),
      );
      harness.complete();
      await result;

      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', detail: 'Could not reach server' }),
      );
    });
  });
});
