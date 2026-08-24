import { StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

// Shared by every admin section so the four tabs stay visually identical
// without each file repeating the same card/input/button rules.
export const adminStyles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  cardBody: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonPrimary: {
    backgroundColor: colors.safe,
  },
  buttonNeutral: {
    backgroundColor: colors.border,
  },
  buttonDanger: {
    backgroundColor: colors.risk,
  },
  buttonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 13,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 32,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.safe,
    borderColor: colors.safe,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
});
