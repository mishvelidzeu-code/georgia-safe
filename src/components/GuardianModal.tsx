import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { askGuardian } from '../lib/guardian';
import { getGuardianContext } from '../lib/guardianContext';
import type { GuardianContext } from '../lib/guardianContext';
import { useGuardianChat } from '../guardian/GuardianChatContext';
import type { ChatMessage } from '../guardian/GuardianChatContext';
import { tapFeedback } from '../lib/haptics';
import { usePremium } from '../premium/PremiumContext';
import { FREE_MESSAGE_LIMIT } from '../lib/premium';

// Four openers covering the assistant's distinct jobs: safety right now,
// planning, scams, and money/transport. Kept short enough to fit one line.
const STARTER_KEYS = [
  'guardian.starter1',
  'guardian.starter2',
  'guardian.starter3',
  'guardian.starter4',
];

function openPlace(query: string) {
  // Requires internet — silently fails instead of throwing when offline,
  // same convention as every other Google Maps deep link in the app.
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  Linking.openURL(url).catch(() => {});
}

/**
 * The one chat window in the app. Rendered a single time, at the root (see
 * RootNavigator) — its conversation lives in GuardianChatProvider, so the
 * history follows the tourist across every tab instead of restarting.
 *
 * `autoSendMessage` comes from the context: a prepared question (the night
 * banner's "suggest a safer route", a suggestion bubble) is sent once per
 * distinct value, never re-sent just because the modal re-renders.
 */
export default function GuardianModal() {
  const { t, language } = useLanguage();
  const { premium, freeRemaining, refresh, showPaywall } = usePremium();
  const { visible, messages, setMessages, autoSendMessage, close, clear, messagesRef, seedIntro } =
    useGuardianChat();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // Holds the in-flight PROMISE, not the resolved value. Storing the value
  // meant a message sent in the first moment after opening — which is exactly
  // what an auto-sent suggestion does — went out with no context at all, so
  // Guardian had no idea where the tourist was and asked them which city they
  // were in. Sending now waits for the same single lookup instead of racing it.
  const contextPromiseRef = useRef<Promise<GuardianContext> | null>(null);
  const sentAutoMessageRef = useRef<string | null>(null);

  // Built fresh on every render, so switching the app language re-translates
  // the welcome that is already sitting in the conversation.
  const introText = `${t('guardian.introTitle')}\n\n${t('guardian.intro')}`;

  useEffect(() => {
    if (!visible) return;
    // Started once per opening, not per message — no repeated permission or
    // GPS requests while a conversation is in progress.
    contextPromiseRef.current = getGuardianContext();
    // First ever open: the assistant explains itself in plain language before
    // the tourist has to think of a question.
    seedIntro(introText);
  }, [visible, seedIntro, introText]);

  const limitTitle = t('premium.limitTitle').replace('{n}', String(FREE_MESSAGE_LIMIT));

  // iOS refuses to present a second modal while this one is still on screen,
  // so tapping the warning looked like nothing happened at all: the paywall
  // was asked for and silently never appeared. Close the chat first and open
  // the paywall from onDismiss, once the chat is really gone. Android has no
  // onDismiss and no such restriction, so it opens straight away.
  const paywallPendingRef = useRef(false);

  const requestPaywall = useCallback(() => {
    tapFeedback();
    if (Platform.OS === 'ios') {
      paywallPendingRef.current = true;
      close();
      return;
    }
    showPaywall('guardian');
  }, [close, showPaywall]);

  const handleDismissed = useCallback(() => {
    if (!paywallPendingRef.current) return;
    paywallPendingRef.current = false;
    showPaywall('guardian');
  }, [showPaywall]);

  // The out-of-questions warning, added to the conversation itself so it sits
  // where the answer would have been. Never stacked twice in a row — one is a
  // warning, several read as a broken app.
  const pushLimitNotice = useCallback(() => {
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (last?.kind === 'limit') return;
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-limit`,
        role: 'assistant',
        kind: 'limit',
        text: limitTitle,
      },
    ]);
  }, [messagesRef, setMessages, limitTitle]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      // Known to be out of questions before spending a round trip on it. The
      // server check below still stands — this only saves the wait.
      if (!premium && freeRemaining <= 0) {
        pushLimitNotice();
        return;
      }

      const userMessage: ChatMessage = { id: `${Date.now()}-user`, role: 'user', text };
      // History = everything so far + the new message, as {role, content}
      // turns. askGuardian caps the length, so memory can't inflate cost.
      // The limit notice is ours, not the assistant's — it never goes to the
      // model.
      const history = [...messagesRef.current, userMessage]
        .filter((message) => message.kind !== 'limit')
        .map((message) => ({
          role: message.role,
          // The stored welcome may be in a language the tourist has since
          // left; send the one they can actually read.
          content: message.kind === 'intro' ? introText : message.text,
        }));

      setMessages((prev) => [...prev, userMessage]);
      setSending(true);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

      // Falls back to a fresh lookup if the modal was somehow sent to without
      // the open effect having run.
      const context = await (contextPromiseRef.current ?? getGuardianContext());
      const result = await askGuardian(history, language, context);

      // The free allowance ran out server-side. Drop the pending question
      // rather than answering it with an error bubble, and leave a warning the
      // tourist can tap when they want to see the plans — the paywall is never
      // pushed into their face mid-conversation.
      if (!result.ok && result.limitReached) {
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        setSending(false);
        void refresh();
        pushLimitNotice();
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text: result.ok ? result.reply : t('guardian.error'),
          places: result.ok && result.places.length > 0 ? result.places : undefined,
        },
      ]);
      setSending(false);
      // Keeps the "N free questions left" counter in step with the server.
      if (!premium) void refresh();
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    [
      sending,
      t,
      language,
      introText,
      setMessages,
      messagesRef,
      premium,
      freeRemaining,
      refresh,
      pushLimitNotice,
    ],
  );

  useEffect(() => {
    if (!visible || !autoSendMessage) return;
    if (sentAutoMessageRef.current === autoSendMessage) return;
    sentAutoMessageRef.current = autoSendMessage;
    sendMessage(autoSendMessage);
  }, [visible, autoSendMessage, sendMessage]);

  // Confirmed rather than instant: the conversation is also the tourist's
  // record of advice they were just given, and there is no undo.
  const confirmClear = useCallback(() => {
    Alert.alert(t('guardian.newChatTitle'), t('guardian.newChatBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('guardian.newChat'),
        style: 'destructive',
        onPress: () => {
          sentAutoMessageRef.current = null;
          clear();
        },
      },
    ]);
  }, [clear, t]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMessage(text);
  }, [input, sendMessage]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} onDismiss={handleDismissed}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 0}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image source={require('../../assets/1.png')} style={styles.headerAvatar} contentFit="contain" />
            <Text style={styles.headerTitle}>{t('guardian.title')}</Text>
          </View>
          <View style={styles.headerActions}>
            {messages.length > 0 && (
              <Pressable onPress={confirmClear} hitSlop={12}>
                <Ionicons name="create-outline" size={24} color={colors.textMuted} />
              </Pressable>
            )}
            <Pressable onPress={close} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <Text style={styles.emptyHint}>{t('guardian.emptyHint')}</Text>
          )}
          {messages.map((message) =>
            message.kind === 'limit' ? (
              <Pressable
                key={message.id}
                style={styles.limitCard}
                onPress={requestPaywall}
                accessibilityRole="button"
              >
                <View style={styles.limitHeader}>
                  <Ionicons name="lock-closed" size={16} color={colors.warning} />
                  <Text style={styles.limitTitle}>{limitTitle}</Text>
                </View>
                <Text style={styles.limitBody}>{t('premium.limitBody')}</Text>
                <View style={styles.limitCtaRow}>
                  <Text style={styles.limitCtaText}>{t('premium.limitCta')}</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.safe} />
                </View>
              </Pressable>
            ) : (
            <View
              key={message.id}
              style={[
                styles.bubble,
                message.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
              ]}
            >
              <Text style={styles.bubbleText}>
                {message.kind === 'intro' ? introText : message.text}
              </Text>
              {message.places && (
                <View style={styles.placesRow}>
                  {message.places.map((place) => (
                    <Pressable
                      key={place.query}
                      style={styles.placeChip}
                      onPress={() => openPlace(place.query)}
                    >
                      <Ionicons name="navigate" size={13} color={colors.safe} />
                      <Text style={styles.placeChipText}>{place.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            ),
          )}

          {!premium && freeRemaining > 0 && (
            <Text style={styles.freeCounter}>
              {t('premium.freeLeft').replace('{n}', String(freeRemaining))}
            </Text>
          )}

          {/* Starter questions, shown only while the intro is the whole
              conversation. A blank chat box asks the tourist to invent a
              question; these show what the assistant is actually for. */}
          {messages.length === 1 && messages[0].role === 'assistant' && !sending && (
            <View style={styles.starters}>
              {STARTER_KEYS.map((key) => (
                <Pressable
                  key={key}
                  style={styles.starterChip}
                  onPress={() => {
                    tapFeedback();
                    sendMessage(t(key));
                  }}
                >
                  <Text style={styles.starterText}>{t(key)}</Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.safe} />
                </Pressable>
              ))}
            </View>
          )}
          {sending && (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <ActivityIndicator color={colors.textMuted} />
            </View>
          )}
        </ScrollView>

        {/* Once the free questions are gone the composer is replaced by the
            warning itself, so nobody types a question that cannot be sent. */}
        {!premium && freeRemaining <= 0 ? (
          <Pressable
            // The bar sat flush against the bottom edge, where the home
            // indicator's swipe area swallows taps — hence "it doesn't click".
            // The inset lifts the whole row clear of it.
            style={[styles.lockedBar, { paddingBottom: insets.bottom + 20 }]}
            onPress={requestPaywall}
            accessibilityRole="button"
          >
            <Ionicons name="lock-closed" size={18} color={colors.warning} />
            <View style={styles.lockedBarBody}>
              <Text style={styles.lockedBarTitle}>{limitTitle}</Text>
              <Text style={styles.lockedBarText}>{t('premium.limitCta')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t('guardian.placeholder')}
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <Pressable
            style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            <Ionicons name="send" size={18} color={colors.background} />
          </Pressable>
        </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 40,
    height: 44,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 10,
  },
  freeCounter: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  limitCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  limitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  limitTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  limitBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  limitCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  limitCtaText: {
    color: colors.safe,
    fontSize: 13,
    fontWeight: '700',
  },
  lockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  lockedBarBody: {
    flex: 1,
  },
  lockedBarTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  lockedBarText: {
    color: colors.safe,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  starters: {
    gap: 8,
    marginTop: 4,
  },
  starterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  starterText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 12,
  },
  bubble: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
    maxWidth: '85%',
  },
  bubbleUser: {
    backgroundColor: colors.safe,
    alignSelf: 'flex-end',
  },
  bubbleAssistant: {
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
  },
  bubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  placesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.safe,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  placeChipText: {
    color: colors.safe,
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.safe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
});
