import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { GuardianPlace } from '../lib/guardian';
import { useAccountPrompt } from '../auth/useAccountPrompt';
import {
  clearGuardianChat,
  getSavedGuardianChat,
  hasSeenGuardianIntro,
  saveGuardianChat,
  setGuardianIntroSeen,
} from '../lib/storage';

// One conversation for the whole app.
//
// Before this, GuardianModal owned its own `messages` state and four different
// components rendered their own copy of it — and GuardianButton is applied per
// tab by withSos(), so every tab had a separate chat. Switching tabs looked
// like the assistant had forgotten everything, because a different instance
// was answering. The history now lives here, above the navigator, and exactly
// one GuardianModal reads it.

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  places?: GuardianPlace[];
  /**
   * Messages the app wrote rather than the assistant.
   *
   * 'limit' is the notice shown when the free questions run out — it renders as
   * a tappable warning that opens the subscription page, not as a chat bubble.
   * 'intro' is the one-time welcome.
   *
   * Both are re-rendered from the current translations instead of the stored
   * `text`, because a conversation is kept for 24 hours and the tourist may
   * change the app language in between — the stored copy would stay in the old
   * language forever.
   */
  kind?: 'limit' | 'intro';
};

type GuardianChat = {
  visible: boolean;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  /** Message to send automatically once the chat opens, if any. */
  autoSendMessage?: string;
  /** Opens the chat, optionally sending a prepared question straight away. */
  open: (autoSendMessage?: string) => void;
  close: () => void;
  /** Live mirror of `messages`, for building history without stale closures. */
  messagesRef: React.MutableRefObject<ChatMessage[]>;
  /** Wipes the conversation from memory and from the phone, immediately. */
  clear: () => void;
  /** True until the assistant has introduced itself once — drives the badge. */
  showIntroBadge: boolean;
  /** Seeds the one-time welcome message. Called by GuardianModal on open. */
  seedIntro: (welcome: string) => void;
};

const GuardianChatContext = createContext<GuardianChat | null>(null);

export function GuardianChatProvider({ children }: { children: React.ReactNode }) {
  const { requireAccount } = useAccountPrompt();
  const [visible, setVisible] = useState(false);
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [autoSendMessage, setAutoSendMessage] = useState<string | undefined>(undefined);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [showIntroBadge, setShowIntroBadge] = useState(false);

  useEffect(() => {
    hasSeenGuardianIntro().then((seen) => setShowIntroBadge(!seen));
  }, []);

  // Keep the ref in step on every write, rather than in an effect — sendMessage
  // reads it immediately after setting state.
  const setMessages = useCallback<React.Dispatch<React.SetStateAction<ChatMessage[]>>>(
    (action) => {
      setMessagesState((prev) => {
        const next = typeof action === 'function' ? (action as (p: ChatMessage[]) => ChatMessage[])(prev) : action;
        messagesRef.current = next;
        return next;
      });
    },
    [],
  );

  // Restore a conversation from earlier today (see GUARDIAN_CHAT_TTL_MS).
  // Anything older is dropped by getSavedGuardianChat itself.
  useEffect(() => {
    let cancelled = false;
    getSavedGuardianChat<ChatMessage>().then((saved) => {
      if (cancelled || !saved || saved.length === 0) return;
      messagesRef.current = saved;
      setMessagesState(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change. Cheap (a few KB) and means a crash or a swipe-away
  // mid-conversation doesn't lose it.
  useEffect(() => {
    void saveGuardianChat(messages);
  }, [messages]);

  // The welcome only lands in an empty conversation: someone returning to a
  // chat from earlier today should not have an introduction pushed into the
  // middle of it.
  const seedIntro = useCallback(
    (welcome: string) => {
      if (!showIntroBadge) return;
      setShowIntroBadge(false);
      void setGuardianIntroSeen();
      if (messagesRef.current.length > 0) return;
      const message: ChatMessage = {
        id: `${Date.now()}-intro`,
        role: 'assistant',
        kind: 'intro',
        text: welcome,
      };
      messagesRef.current = [message];
      setMessagesState([message]);
    },
    [showIntroBadge],
  );

  const clear = useCallback(() => {
    messagesRef.current = [];
    setMessagesState([]);
    setAutoSendMessage(undefined);
    void clearGuardianChat();
  }, []);

  // Gated here rather than at each caller: the mascot, the suggestion bubble
  // and the night banner all open the same chat, and a guest must not reach
  // it from any of them — free messages are metered per account on the
  // server, so an anonymous caller could not be limited at all.
  const open = useCallback(
    (message?: string) => {
      if (requireAccount()) return;
      setAutoSendMessage(message);
      setVisible(true);
    },
    [requireAccount],
  );

  const close = useCallback(() => {
    setVisible(false);
    // Cleared so reopening the chat by hand doesn't replay the last prepared
    // question; the conversation itself is deliberately kept.
    setAutoSendMessage(undefined);
  }, []);

  const value = useMemo(
    () => ({
      visible,
      messages,
      setMessages,
      autoSendMessage,
      open,
      close,
      clear,
      messagesRef,
      showIntroBadge,
      seedIntro,
    }),
    [visible, messages, setMessages, autoSendMessage, open, close, clear, showIntroBadge, seedIntro],
  );

  return <GuardianChatContext.Provider value={value}>{children}</GuardianChatContext.Provider>;
}

export function useGuardianChat(): GuardianChat {
  const value = useContext(GuardianChatContext);
  if (!value) throw new Error('useGuardianChat must be used inside GuardianChatProvider');
  return value;
}
