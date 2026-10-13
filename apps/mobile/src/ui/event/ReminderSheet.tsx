import { ScrollView } from 'react-native';
import { List } from 'react-native-paper';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import type { ParticipantReminder } from '../../domain/docTypes';
import { REMINDER_LEADS, reminderLabel, sameReminder } from '../../domain/notificationPrefs';
import { ICONS } from '../icons';
import { useColors } from '../theme';

const CHOICES: ParticipantReminder[] = [
  { mode: 'Default', minutesBefore: null },
  { mode: 'Off', minutesBefore: null },
  ...REMINDER_LEADS.map((minutesBefore) => ({ mode: 'Before' as const, minutesBefore })),
];

/** Your own reminder for one event; `defaultMinutes` null = the default gives it none. */
export function ReminderSheet({ value, defaultMinutes, onPick, onDismiss }: {
  value: ParticipantReminder | null;
  defaultMinutes: number | null;
  onPick: (reminder: ParticipantReminder) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  return (
    <Sheet title="Reminder" onDismiss={onDismiss}>
      <ScrollView>
        {CHOICES.map((choice) => (
          <List.Item
            key={`${choice.mode}${choice.minutesBefore ?? ''}`}
            title={reminderLabel(choice, defaultMinutes)}
            right={() => (sameReminder(value, choice) ? <List.Icon icon={ICONS.check} color={c.primary} /> : null)}
            onPress={() => {
              onPick(choice);
              onDismiss();
            }}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}
