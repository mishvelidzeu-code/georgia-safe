import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useLanguage } from '../i18n/LanguageContext';
import { askGuardian } from '../lib/guardian';
import type { GuardianPlace } from '../lib/guardian';
import { getGuardianContext } from '../lib/guardianContext';
import type { GuardianContext } from '../lib/guardianContext';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  places?: GuardianPlace[];
};

function openPlace(query: string) {
  // Requires internet — silently fails instead of throwing when offline,
  // same convention as every other Google Maps deep link in the app.
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  Linking.openURL(url).catch(() => {});
}

type Props = {
  visible: boolean;
  onClose: () => void;
  // Optional message to send automatically the moment the modal opens (used
  // by NightSafetyBanner's "suggest a safer route" CTA) — sent once per
  // distinct value, never re-sent just because the modal re-renders.
  autoSendMessage?: string;
};

export default function GuardianModal({ visible, onClose, autoSendMessage }: Props) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const contextRef = useRef<GuardianContext | undefined>(undefined);
  const sentAutoMessageRef = useRef<string | null>(null);
  // Mirror of `messages` for building the conversation history inside
  // sendMessage without stale-closure issues.
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!visible) return;
    // Fetch once per time the modal opens, not per message — avoids
    // re-requesting location/permission on every send.
    getGuardianContext().then((context) => {
      contextRef.current = context;
    });
  }, [visible]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      const userMessage: ChatMessage = { id: `${Date.now()}-user`, role: 'user', text };
      // History = everything so far + the new message, as {role, content}
      // turns. askGuardian caps the length, so memory can't inflate cost.
      const history = [...messagesRef.current, userMessage].map((message) => ({
        role: message.role,
        content: message.text,
      }));

      setMessages((prev) => [...prev, userMessage]);
      setSending(true);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

      const result = await askGuardian(history, contextRef.current);

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
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    [sending, t],
  );

  useEffect(() => {
    if (!visible || !autoSendMessage) return;
    if (sentAutoMessageRef.current === autoSendMessage) return;
    sentAutoMessageRef.current = autoSendMessage;
    sendMessage(autoSendMessage);
  }, [visible, autoSendMessage, sendMessage]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMessage(text);
  }, [input, sendMessage]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('guardian.title')}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
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
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubble,
                message.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
              ]}
            >
              <Text style={styles.bubbleText}>{message.text}</Text>
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
          ))}
          {sending && (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <ActivityIndicator color={colors.textMuted} />
            </View>
          )}
        </ScrollView>

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
