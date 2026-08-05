import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import {
  catchError,
  concatMap,
  map,
  mergeMap,
  of,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs';

import { type ApiErrorCode, getApiErrorCode } from '../../../api/api-error.model';
import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { selectAuthUser } from '../../auth/store/auth.selectors';
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  type ChatMessage,
  type ChatRealtimeMessage,
} from '../models/chat.model';
import { ChatBadgeService } from '../services/chat-badge.service';
import { ChatApiService } from '../services/chat-api.service';
import * as ChatActions from './chat.actions';
import {
  selectActiveConversation,
  selectConversations,
} from './chat.selectors';

/**
 * Server ServiceError codes → the i18n keys the composer's client-side
 * pre-checks already use. The client checks are only a fast path: the browser
 * derives `File.type` from the extension, so a renamed text file passes them
 * and is caught by the server's magic-byte validation instead. Without this map
 * that rejection would surface the server's hardcoded-English ProblemDetails
 * `title`, untranslated.
 */
const CHAT_ERROR_MESSAGE_KEYS: Readonly<Partial<Record<ApiErrorCode, string>>> = {
  'chat.attachment_invalid_type': 'chat.details.imageInvalidType',
  'chat.attachment_too_large': 'chat.details.imageTooLarge',
  'chat.conversation_closed': 'chat.details.closedBanner',
};

const CHAT_TOAST_LIFE_MS = 7000;

/** Map a viewer-neutral hub message to the local, viewer-relative shape. */
function toChatMessage(
  raw: ChatRealtimeMessage,
  currentUserId: string | null,
): ChatMessage {
  return {
    ...raw,
    isMine: raw.senderId !== null && raw.senderId === currentUserId,
    seen: false,
  };
}

@Injectable()
export class ChatEffects {
  private readonly actions$ = inject(Actions);
  private readonly chatApi = inject(ChatApiService);
  private readonly store = inject(Store);
  private readonly chatBadge = inject(ChatBadgeService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  /**
   * Translate a known chat error code; fall back to the generic HTTP message
   * for anything unmapped. The code is read from the ProblemDetails `errorCode`
   * member via `getApiErrorCode` — NOT from `type`, which is an opaque
   * `urn:rental:error:<code>` URI reference (see `ApiProblemDetails`).
   */
  private toErrorMessage(error: unknown): string {
    const key = CHAT_ERROR_MESSAGE_KEYS[getApiErrorCode(error) ?? ''];
    if (key === undefined) {
      return toApiErrorMessage(error);
    }
    // `imageTooLarge` interpolates {{max}}; the other keys ignore it.
    return this.translate.instant(key, {
      max: Math.round(CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024)),
    });
  }

  readonly loadConversations$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ChatActions.loadConversations),
      switchMap(() =>
        this.chatApi.getConversations().pipe(
          map((conversations) =>
            ChatActions.loadConversationsSuccess({ conversations }),
          ),
          catchError((error: unknown) =>
            of(
              ChatActions.loadConversationsFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly loadConversationDetails$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ChatActions.loadConversationDetails),
      switchMap(({ conversationId }) =>
        this.chatApi.getConversationDetails(conversationId).pipe(
          map((conversation) =>
            ChatActions.loadConversationDetailsSuccess({ conversation }),
          ),
          catchError((error: unknown) =>
            of(
              ChatActions.loadConversationDetailsFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly sendMessage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ChatActions.sendMessage),
      concatMap(({ conversationId, content }) =>
        this.chatApi.sendMessage(conversationId, content).pipe(
          map((message) => ChatActions.sendMessageSuccess({ message })),
          catchError((error: unknown) =>
            of(
              ChatActions.sendMessageFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  /**
   * Upload an image attachment. The file arrives already compressed and
   * validated by the composer. On success the object URL behind the optimistic
   * bubble is revoked (the bubble is replaced by the server message); on failure
   * it is kept so the failed bubble still shows the picture.
   */
  readonly sendImageMessage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ChatActions.sendImageMessage),
      concatMap(({ conversationId, file, caption, previewUrl }) =>
        this.chatApi.sendImageMessage(conversationId, file, caption).pipe(
          map((message) => {
            URL.revokeObjectURL(previewUrl);
            return ChatActions.sendImageMessageSuccess({ message });
          }),
          catchError((error: unknown) =>
            of(
              ChatActions.sendImageMessageFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly markConversationRead$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ChatActions.markConversationRead),
      concatMap(({ conversationId }) =>
        this.chatApi.markRead(conversationId).pipe(
          map(() => ChatActions.markConversationReadSuccess({ conversationId })),
          catchError((error: unknown) =>
            of(
              ChatActions.markConversationReadFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  /**
   * Opens (creating if needed) the conversation tied to a booking — the
   * "Message {owner}" CTA on the booking confirmation screen. The caller
   * (e.g. `ListingBookingPageComponent`) never touches `ChatApiService`
   * directly; it only dispatches {@link ChatActions.openConversationFromBooking}.
   */
  readonly openConversationFromBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ChatActions.openConversationFromBooking),
      switchMap(({ bookingId }) =>
        this.chatApi.getOrCreateFromBooking(bookingId).pipe(
          map((conversation) =>
            ChatActions.openConversationFromBookingSuccess({ conversation }),
          ),
          catchError((error: unknown) =>
            of(
              ChatActions.openConversationFromBookingFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  /** Navigate to the thread once it's open — kept separate so the dispatching
   * effect above stays a pure action mapper. */
  readonly navigateAfterOpenConversationFromBooking$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ChatActions.openConversationFromBookingSuccess),
        tap(({ conversation }) => {
          void this.router.navigate(['/chat', conversation.id]);
        }),
      ),
    { dispatch: false },
  );

  /** Surface a failure to open/create the conversation via the global toast —
   * the button must never look like it silently did nothing. */
  readonly openConversationFromBookingErrorToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ChatActions.openConversationFromBookingFailure),
        tap(({ error }) => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('chat.details.openFromBookingErrorTitle'),
            detail: error,
            life: CHAT_TOAST_LIFE_MS,
          });
        }),
      ),
    { dispatch: false },
  );

  /**
   * Resolve a raw hub message against the current user (isMine) and store it.
   * When it lands in the open conversation and is not ours, mark the thread read
   * (the user is looking at it).
   */
  readonly realtimeMessageReceived$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ChatActions.realtimeMessageReceived),
      withLatestFrom(
        this.store.select(selectAuthUser),
        this.store.select(selectActiveConversation),
      ),
      mergeMap(([{ message: raw }, user, activeConversation]) => {
        const message = toChatMessage(raw, user?.id ?? null);
        const isOpen =
          activeConversation !== null &&
          activeConversation.id === message.conversationId;

        const actions: ReturnType<
          | typeof ChatActions.realtimeMessageResolved
          | typeof ChatActions.markConversationRead
          | typeof ChatActions.loadConversationDetails
        >[] = [ChatActions.realtimeMessageResolved({ message })];

        if (isOpen && !message.isMine) {
          actions.push(
            ChatActions.markConversationRead({
              conversationId: message.conversationId,
            }),
          );
        }

        // A system message fires only on a real booking transition. Re-fetch the
        // open conversation so the server re-derives the authoritative `status`
        // and `isClosed` (ADR-001: "closed" also depends on both reviews being
        // in — a server-side rule). Without this the header status pill stays
        // stale (M-007). Skipped for ordinary text messages.
        if (isOpen && message.type === 'system') {
          actions.push(
            ChatActions.loadConversationDetails({
              conversationId: message.conversationId,
            }),
          );
        }

        return actions;
      }),
    ),
  );

  /** Resolve the `conversationRead` reader identity against the current user. */
  readonly realtimeConversationRead$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ChatActions.realtimeConversationRead),
      withLatestFrom(this.store.select(selectAuthUser)),
      map(([{ conversationId, readerUserId, readAtUtc }, user]) =>
        ChatActions.realtimeConversationReadResolved({
          conversationId,
          readAtUtc,
          readerIsMe: user !== null && readerUserId === user.id,
        }),
      ),
    ),
  );

  /**
   * Keep the global nav badge in lockstep with the store whenever the chat
   * feature is loaded — so it clears instantly on read and bumps instantly on an
   * incoming message, no 60s poll. The badge sums `unreadCount` across the
   * inbox. An empty inbox means "not loaded yet" (a user in chat has at least
   * one conversation), so we skip it to avoid clobbering the cold-start count
   * that ChatRealtimeService maintains.
   */
  readonly syncNavBadge$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          ChatActions.loadConversationsSuccess,
          ChatActions.realtimeMessageResolved,
          ChatActions.realtimeConversationReadResolved,
          ChatActions.markConversationRead,
          ChatActions.markConversationReadSuccess,
        ),
        withLatestFrom(this.store.select(selectConversations)),
        tap(([, conversations]) => {
          if (conversations.length === 0) {
            return;
          }
          const total = conversations.reduce(
            (sum, c) => sum + Math.max(0, c.unreadCount),
            0,
          );
          this.chatBadge.setUnreadCount(total);
        }),
      ),
    { dispatch: false },
  );
}
