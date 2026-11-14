import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Reminder } from '../types';

export const ALARM_CHANNEL = 'medication-alarms';

export async function prepareNotifications() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
    name: 'Lembretes de saúde', importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 350, 250, 350], sound: 'default', lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) await Notifications.requestPermissionsAsync();
}

export async function hasExactAlarmPermission() {
  if (Platform.OS !== 'android') return true;
  const result = await Notifications.getExactAlarmPermissionsAsync();
  return result.granted;
}

export async function requestExactAlarmPermission() {
  if (Platform.OS === 'android') await Notifications.requestExactAlarmPermissionsAsync();
}

function nextOccurrence(reminder: Reminder, after = new Date()) {
  if (reminder.intervalHours && reminder.intervalHours > 0 && reminder.hasFired) {
    return new Date(after.getTime() + reminder.intervalHours * 60 * 60_000);
  }
  const [hours, minutes] = reminder.time.split(':').map(Number);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(after);
    candidate.setDate(after.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    const validDay = reminder.days.length === 0 || reminder.days.includes(candidate.getDay());
    if (validDay && candidate.getTime() > after.getTime() + 1000) return candidate;
  }
  const fallback = new Date(after);
  fallback.setDate(after.getDate() + 1);
  fallback.setHours(hours, minutes, 0, 0);
  return fallback;
}

export async function cancelReminderNotifications(reminder: Reminder) {
  for (const id of [reminder.notificationId, reminder.toleranceNotificationId]) {
    if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  }
}

export async function scheduleReminder(reminder: Reminder): Promise<Reminder> {
  await cancelReminderNotifications(reminder);
  if (!reminder.enabled) return { ...reminder, notificationId: undefined, toleranceNotificationId: undefined };
  const when = nextOccurrence(reminder);
  const exact = await hasExactAlarmPermission();
  const trigger: Notifications.DateTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: when,
    channelId: ALARM_CHANNEL,
    ...(Platform.OS === 'android' && exact ? { delivery: 'alarmClock' as const } : {}),
  };
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Hora do seu cuidado', body: reminder.title,
      sound: reminder.sound === 'default' ? 'default' : 'default',
      data: { reminderId: reminder.id, kind: 'alarm' },
      categoryIdentifier: 'MEDICATION_ALARM',
    }, trigger,
  });

  let toleranceNotificationId: string | undefined;
  if (reminder.notifyFamily && reminder.familyPhone.trim()) {
    const followAt = new Date(when.getTime() + reminder.toleranceMinutes * 60_000);
    toleranceNotificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Lembrete sem confirmação', body: `Deseja avisar ${reminder.title} à pessoa de confiança?`,
        data: { reminderId: reminder.id, kind: 'tolerance', phone: reminder.familyPhone, medicine: reminder.title },
      },
      trigger: { ...trigger, date: followAt },
    });
  }
  return { ...reminder, notificationId, toleranceNotificationId };
}

export async function notifyFamily(phone: string, medicine: string) {
  const digits = phone.replace(/\D/g, '');
  const message = encodeURIComponent(`Aviso: o lembrete “${medicine}” ainda não foi confirmado. Entre em contato para verificar se está tudo bem.`);
  const whatsappUrl = `https://wa.me/${digits}?text=${message}`;
  try {
    await Linking.openURL(whatsappUrl);
  } catch {
    await Linking.openURL(`sms:${digits}?body=${message}`);
  }
}
