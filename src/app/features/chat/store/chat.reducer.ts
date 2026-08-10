import { createReducer, on } from '@ngrx/store';

import type {
  ChatConversationDetails,
  ChatConversationPreview,
  ChatMessage,
} from '../models/chat.model';
import * as ChatActions from './chat.actions';
import { initialChatState, type ChatState } from './chat.state';

export const chatFeatureKey = 'chat' as const;

/**
 * Merge a freshly received message into the inbox row for its conversation:
 * refresh the last-message preview and bump the unread counter when it is an
 * incoming message the user is not currently looking at. Rows that do not exist
 * yet (e.g. a brand-new conversation) are left untouched — the next
 * `loadConversations` reconciles them.
 */
function applyMessageToInbox(
  conversations: ChatConversationPreview[],
  message: ChatMessage,
  isOpenConversation: boolean,
): ChatConversationPreview[] {
  return conversations.map((conversation) => {
    if (conversation.id !== message.conversationId) {
      return conversation;
    }

    const bumpsUnread = !message.isMine && !isOpenConversation;
    return {
      ...conversation,
      // An image with no caption has a null body — the row then renders the
      // localized "Photo" label off `lastMessageType`, so don't fall back to the
      // previous (now stale) snippet.
      lastMessageSnippet: message.body,
      lastMessageType: message.type,
      lastMessageIsMine: message.isMine,
      lastMessageAt: message.sentAt,
      unreadCount: bumpsUnread
        ? conversation.unreadCount + 1
        : conversation.unreadCount,
    };
  });
}

/**
 * Append `message` to the open conversation, deduped by the stable server id.
 *
 * A sent message reaches the client through TWO channels — the HTTP response of
 * the send (text or image upload) and the SignalR echo the hub broadcasts back
 * to the sender — and either can win the race. EVERY append path must go through
 * this helper (knowledge/mistakes.md M-006).
 */
function appendMessageDeduped(
  conversation: ChatConversationDetails,
  message: ChatMessage,
): ChatConversationDetails {
  const alreadyPresent = conversation.messages.some((m) => m.id === message.id);
  return alreadyPresent
    ? conversation
    : { ...conversation, messages: [...conversation.messages, message] };
}

export const chatReducer = createReducer(
  initialChatState,
  on(
    ChatActions.loadConversations,
    (state): ChatState => ({
      ...state,
      conversationsLoading: true,
      conversationsError: null,
    }),
  ),
  on(
    ChatActions.loadConversationsSuccess,
    (state, { conversations }): ChatState => ({
      ...state,
      conversations: [...conversations],
      conversationsLoading: false,
      conversationsError: null,
    }),
  ),
  on(
    ChatActions.loadConversationsFailure,
    (state, { error }): ChatState => ({
      ...state,
      conversationsLoading: false,
      conversationsError: error,
    }),
  ),
  on(
    ChatActions.loadConversationDetails,
    (state): ChatState => ({
      ...state,
      activeConversationLoading: true,
      activeConversationError: null,
      sendingMessageError: null,
    }),
  ),
  on(
    ChatActions.loadConversationDetailsSuccess,
    (state, { conversation }): ChatState => ({
      ...state,
      activeConversation: conversation,
      activeConversationLoading: false,
      activeConversationError: null,
    }),
  ),
  on(
    ChatActions.loadConversationDetailsFailure,
    (state, { error }): ChatState => ({
      ...state,
      activeConversationLoading: false,
      activeConversationError: error,
    }),
  ),
  on(
    ChatActions.sendMessage,
    (state): ChatState => ({
      ...state,
      sendingMessage: true,
      sendingMessageError: null,
    }),
  ),
  on(
    ChatActions.sendMessageSuccess,
    (state, { message }): ChatState => {
      if (
        state.activeConversation === null ||
        state.activeConversation.id !== message.conversationId
      ) {
        return {
          ...state,
          sendingMessage: false,
          sendingMessageError: null,
        };
      }

      // Deduped against the SignalR echo: the hub broadcasts `messageReceived`
      // to the sender too, and it can land before this POST response (M-006).
      return {
        ...state,
        sendingMessage: false,
        sendingMessageError: null,
        activeConversation: appendMessageDeduped(
          state.activeConversation,
          message,
        ),
      };
    },
  ),
  on(
    ChatActions.sendMessageFailure,
    (state, { error }): ChatState => ({
      ...state,
      sendingMessage: false,
      sendingMessageError: error,
    }),
  ),
  on(
    ChatActions.sendImageMessage,
    (state, { conversationId, previewUrl, caption }): ChatState => ({
      ...state,
      pendingImage: { conversationId, previewUrl, caption, failed: false },
      sendingImageError: null,
    }),
  ),
  on(
    ChatActions.sendImageMessageSuccess,
    (state, { message }): ChatState => {
      const base: ChatState = {
        ...state,
        pendingImage: null,
        sendingImageError: null,
      };

      if (
        state.activeConversation === null ||
        state.activeConversation.id !== message.conversationId
      ) {
        return base;
      }

      // Same two-channel race as the text send: the hub echoes the image back to
      // the uploader, so this HTTP response may be the SECOND arrival (M-006).
      return {
        ...base,
        activeConversation: appendMessageDeduped(
          state.activeConversation,
          message,
        ),
      };
    },
  ),
  on(
    ChatActions.sendImageMessageFailure,
    (state, { error }): ChatState => ({
      ...state,
      pendingImage:
        state.pendingImage === null
          ? null
          : { ...state.pendingImage, failed: true },
      sendingImageError: error,
    }),
  ),
  on(
    ChatActions.dismissPendingImage,
    (state): ChatState => ({
      ...state,
      pendingImage: null,
      sendingImageError: null,
    }),
  ),
  on(
    ChatActions.markConversationRead,
    (state, { conversationId }): ChatState => ({
      ...state,
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation,
      ),
    }),
  ),
  on(
    ChatActions.realtimeMessageResolved,
    (state, { message }): ChatState => {
      const isOpenConversation =
        state.activeConversation !== null &&
        state.activeConversation.id === message.conversationId;

      const conversations = applyMessageToInbox(
        state.conversations,
        message,
        isOpenConversation,
      );

      if (!isOpenConversation) {
        return { ...state, conversations };
      }

      // Deduped against the HTTP response of our own send (text or image) —
      // whichever channel arrives first wins, the other is a no-op (M-006).
      return {
        ...state,
        conversations,
        activeConversation: appendMessageDeduped(
          state.activeConversation!,
          message,
        ),
      };
    },
  ),
  on(
    ChatActions.realtimeConversationReadResolved,
    (state, { conversationId, readAtUtc, readerIsMe }): ChatState => {
      // The current user read the thread (elsewhere or here) → clear its unread.
      if (readerIsMe) {
        return {
          ...state,
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        };
      }

      // The counterpart read the open thread → mark my delivered messages "Seen".
      if (
        state.activeConversation === null ||
        state.activeConversation.id !== conversationId
      ) {
        return state;
      }

      const readAt = new Date(readAtUtc).getTime();
      return {
        ...state,
        activeConversation: {
          ...state.activeConversation,
          messages: state.activeConversation.messages.map((m) =>
            m.isMine && !m.seen && new Date(m.sentAt).getTime() <= readAt
              ? { ...m, seen: true }
              : m,
          ),
        },
      };
    },
  ),
  on(
    ChatActions.openConversationFromBooking,
    (state): ChatState => ({
      ...state,
      openingConversationFromBooking: true,
    }),
  ),
  on(
    ChatActions.openConversationFromBookingSuccess,
    (state, { conversation }): ChatState => ({
      ...state,
      openingConversationFromBooking: false,
      activeConversation: conversation,
    }),
  ),
  on(
    ChatActions.openConversationFromBookingFailure,
    (state): ChatState => ({
      ...state,
      openingConversationFromBooking: false,
    }),
  ),
);
