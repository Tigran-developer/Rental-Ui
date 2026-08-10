import type {
  ChatConversationDetails,
  ChatConversationPreview,
} from '../models/chat.model';

/**
 * The image currently being uploaded (or the one whose upload just failed),
 * rendered as an optimistic bubble at the end of the thread. `previewUrl` is a
 * local object URL of the compressed file — revoked once the server message
 * lands.
 */
export interface PendingChatImage {
  readonly conversationId: string;
  readonly previewUrl: string;
  readonly caption: string | null;
  readonly failed: boolean;
}

export interface ChatState {
  conversations: ChatConversationPreview[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  activeConversation: ChatConversationDetails | null;
  activeConversationLoading: boolean;
  activeConversationError: string | null;
  sendingMessage: boolean;
  sendingMessageError: string | null;
  pendingImage: PendingChatImage | null;
  sendingImageError: string | null;
  /** In flight for `openConversationFromBooking` (the "Message {owner}" CTA). */
  openingConversationFromBooking: boolean;
}

export const initialChatState: ChatState = {
  conversations: [],
  conversationsLoading: false,
  conversationsError: null,
  activeConversation: null,
  activeConversationLoading: false,
  activeConversationError: null,
  sendingMessage: false,
  sendingMessageError: null,
  pendingImage: null,
  sendingImageError: null,
  openingConversationFromBooking: false,
};
