import { createAction, props } from '@ngrx/store';

import type {
  ChatConversationDetails,
  ChatConversationPreview,
  ChatMessage,
  ChatRealtimeMessage,
} from '../models/chat.model';

export const loadConversations = createAction('[Chat] Load Conversations');

export const loadConversationsSuccess = createAction(
  '[Chat] Load Conversations Success',
  props<{ conversations: ChatConversationPreview[] }>(),
);

export const loadConversationsFailure = createAction(
  '[Chat] Load Conversations Failure',
  props<{ error: string }>(),
);

export const loadConversationDetails = createAction(
  '[Chat] Load Conversation Details',
  props<{ conversationId: string }>(),
);

export const loadConversationDetailsSuccess = createAction(
  '[Chat] Load Conversation Details Success',
  props<{ conversation: ChatConversationDetails }>(),
);

export const loadConversationDetailsFailure = createAction(
  '[Chat] Load Conversation Details Failure',
  props<{ error: string }>(),
);

export const sendMessage = createAction(
  '[Chat] Send Message',
  props<{ conversationId: string; content: string }>(),
);

export const sendMessageSuccess = createAction(
  '[Chat] Send Message Success',
  props<{ message: ChatMessage }>(),
);

export const sendMessageFailure = createAction(
  '[Chat] Send Message Failure',
  props<{ error: string }>(),
);

/**
 * Upload + send an image attachment. `file` is already compressed and validated
 * by the composer (type + `CHAT_ATTACHMENT_MAX_BYTES`); `previewUrl` is a local
 * object URL used to render the optimistic "sending" bubble until the server
 * message arrives.
 */
export const sendImageMessage = createAction(
  '[Chat] Send Image Message',
  props<{
    conversationId: string;
    file: File;
    caption: string | null;
    previewUrl: string;
  }>(),
);

export const sendImageMessageSuccess = createAction(
  '[Chat] Send Image Message Success',
  props<{ message: ChatMessage }>(),
);

/**
 * Upload rejected — by the server, or client-side before it ever left the
 * browser (wrong type / too large). `error` is already a display string.
 */
export const sendImageMessageFailure = createAction(
  '[Chat] Send Image Message Failure',
  props<{ error: string }>(),
);

/** Dismisses the failed optimistic image bubble + its error banner. */
export const dismissPendingImage = createAction('[Chat] Dismiss Pending Image');

export const markConversationRead = createAction(
  '[Chat] Mark Conversation Read',
  props<{ conversationId: string }>(),
);

export const markConversationReadSuccess = createAction(
  '[Chat] Mark Conversation Read Success',
  props<{ conversationId: string }>(),
);

export const markConversationReadFailure = createAction(
  '[Chat] Mark Conversation Read Failure',
  props<{ error: string }>(),
);

// --- Realtime (SignalR chat hub) ---------------------------------------------

/**
 * Raw viewer-neutral message received over the hub. Dispatched by
 * `ChatRealtimeService`; enriched with the current user (isMine) by the effect,
 * which then dispatches {@link realtimeMessageResolved}.
 */
export const realtimeMessageReceived = createAction(
  '[Chat] Realtime Message Received',
  props<{ message: ChatRealtimeMessage }>(),
);

/**
 * A hub message mapped to the local `ChatMessage` shape (isMine resolved,
 * seen=false). The reducer dedupes by id, appends to the open conversation and
 * updates the inbox row.
 */
export const realtimeMessageResolved = createAction(
  '[Chat] Realtime Message Resolved',
  props<{ message: ChatMessage }>(),
);

/**
 * Raw `conversationRead` hub event. Dispatched by `ChatRealtimeService`;
 * resolved against the current user by the effect into
 * {@link realtimeConversationReadResolved}.
 */
export const realtimeConversationRead = createAction(
  '[Chat] Realtime Conversation Read',
  props<{ conversationId: string; readerUserId: string; readAtUtc: string }>(),
);

/**
 * A `conversationRead` event with the reader identity resolved. `readerIsMe`
 * true → the current user read it elsewhere (clear my unread); false → the
 * counterpart read my messages (live "Seen").
 */
export const realtimeConversationReadResolved = createAction(
  '[Chat] Realtime Conversation Read Resolved',
  props<{ conversationId: string; readAtUtc: string; readerIsMe: boolean }>(),
);

// --- Cross-feature entry point (e.g. "Message {owner}" on the booking
// confirmation screen) ---------------------------------------------------

/**
 * Opens (creating if needed) the conversation tied to a booking, then
 * navigates there. Dispatched from outside the chat feature — callers never
 * hit `ChatApiService` directly. Consumers that dispatch this must also
 * provide `chatFeatureKey`/`ChatEffects` on their route (see
 * `features/listings/routes.ts` for the precedent already used by
 * `bookingsFeatureKey`), since the chat store is registered lazily per
 * consuming route rather than app-wide.
 */
export const openConversationFromBooking = createAction(
  '[Chat] Open Conversation From Booking',
  props<{ bookingId: string }>(),
);

export const openConversationFromBookingSuccess = createAction(
  '[Chat] Open Conversation From Booking Success',
  props<{ conversation: ChatConversationDetails }>(),
);

export const openConversationFromBookingFailure = createAction(
  '[Chat] Open Conversation From Booking Failure',
  props<{ error: string }>(),
);
