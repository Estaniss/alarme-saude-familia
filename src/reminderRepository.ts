import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { theme } from '../theme';
import { isValidTime } from '../utils/masks';
import { parseTime } from '../utils/occurrences';

type Props = {
  /** "HH:mm", 24h. */
  value: string;
  onChange: (time: string) => void;
  accessibilityLabel?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Campo de horário: toque para escolher no relógio do Android (sempre em 24h,
 * independente de o celular estar em 12h). O app é apenas Android.
 */
export function TimeField({ value, onChange, accessibilityLabel = 'Horário do lembrete' }: Props) {
  const valid = isValidTime(value);

  const open = () => {
    const [hours, minutes] = valid ? parseTime(value) : [8, 0];
    const base = new Date();
    base.setHours(hours, minutes, 0, 0);
    DateTimePickerAndroid.open({
      value: base,
      mode: 'time',
      is24Hour: true,
      onValueChange: (_event, date) => onChange(`${pad(date.getHours())}:${pad(date.getMinutes())}`),
    });
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${valid ? value : 'não definido'}. Toque para alterar.`}
      style={({ pressed }) => ({
        minHeight: 60,
        paddingHorizontal: 16,
        borderRadius: 13,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '800', letterSpacing: 1 }}>
          {valid ? value : '--:--'}
        </Text>
        <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '700' }}>Alterar ›</Text>
      </View>
    </Pressable>
  );
}
