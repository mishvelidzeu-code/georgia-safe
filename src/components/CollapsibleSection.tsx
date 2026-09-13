import { useState } from 'react';
import type { ReactNode } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { tapFeedback } from '../lib/haptics';

type Props = {
  title: string;
  /** Short current value shown next to the title while collapsed (e.g. the chosen language). */
  summary?: string;
  initiallyOpen?: boolean;
  children: ReactNode;
};

/**
 * A titled section that starts folded and opens on tap. Used on the Emergency
 * and Profile screens so a long settings list reads as a short table of
 * contents; the header stays big enough to hit in a hurry.
 */
export default function CollapsibleSection({ title, summary, initiallyOpen = false, children }: Props) {
  const [open, setOpen] = useState(initiallyOpen);

  const toggle = () => {
    tapFeedback();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((value) => !value);
  };

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.header}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          {!open && summary ? <Text style={styles.summary} numberOfLines={1}>{summary}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Border only, no fill — the cards inside keep their own colour and stay
  // distinguishable from the section that wraps them.
  section: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  summary: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  body: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
});
