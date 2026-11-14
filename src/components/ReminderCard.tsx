import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { theme } from '../theme';
import { Reminder } from '../types';

export function ReminderCard({ item, onEdit, onToggle }: {
  item: Reminder; onEdit: () => void; onToggle: (enabled: boolean) => void;
}) {
  return <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.time}. Editar lembrete.`}
    style={({ pressed }) => ({ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1,
      borderRadius: theme.radius.md, padding: 18, marginBottom: 12, opacity: pressed ? 0.84 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '700' }}>{item.title}</Text>
        <Text style={{ color: theme.colors.muted, fontSize: 15, marginTop: 6 }}>{item.intervalHours ? `${item.time} · a cada ${item.intervalHours}h` : `${item.time} · ${item.days.length ? item.days.map((d) => ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d]).join(', ') : 'Todos os dias'}`}</Text>
        {item.notifyFamily && <Text style={{ color: theme.colors.primary, fontSize: 13, marginTop: 6 }}>Alerta familiar · {item.toleranceMinutes} min</Text>}
      </View>
      <Switch value={item.enabled} onValueChange={onToggle} accessibilityLabel={`Ativar ${item.title}`} trackColor={{ true: theme.colors.primary }} />
    </View>
  </Pressable>;
}
