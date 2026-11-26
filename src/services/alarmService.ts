import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Reminder } from '../types';
import { toInternationalNumber } from '../utils/masks';
import { parseTime, upcomingOccurrences } from '../utils/occurrences';

export const ALARM_CHANNEL = 'medication-alarms';

export const CATEGORY_ALARM = 'MEDICATION_ALARM';
export const CATEGORY_TOLERANCE = 'TOLERANCE_ALERT';

export const ACTION_CONFIRM = 'CONFIRM';
export const ACTION_SNOOZE = 'SNOOZE';
export const ACTION_WHATSAPP = 'SEND_WHATSAPP';
export const ACTION_SMS = 'SEND_SMS';

export const SNOOZE_MINUTES = 10;

const MINUTE = 60_000;

const T = Notifications.SchedulableTriggerInputTypes;

// ---------------------------------------------------------------------------
// Dados que viajam dentro de cada notificação
// ---------------------------------------------------------------------------

export type NotificationData = {
  reminderId: string;
  kind: 'alarm' | 'tolerance';
  /** Horário (ms) da ocorrência do alarme a que esta notificação pertence. */
  occurrence?: number;
  phone?: string;
  medicine?: string;
};

export function parseNotificationData(raw: unknown): NotificationData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.reminderId !== 'string') return null;
  if (d.kind !== 'alarm' && d.kind !== 'tolerance') return null;
  return {
    reminderId: d.reminderId,
    kind: d.kind,
    occurrence: typeof d.occurrence === 'number' ? d.occurrence : undefined,
    phone: typeof d.phone === 'string' ? d.phone : undefined,
    medicine: typeof d.medicine === 'string' ? d.medicine : undefined,
  };
}

/** Aviso à família cujo alarme já tocou e que ainda vai disparar (ou foi disparado). */
function isAwaitingTolerance(d: NotificationData) {
  return d.kind === 'tolerance' && (d.occurrence ?? 0) <= Date.now();
}

// ---------------------------------------------------------------------------
// Fila: evita que duas reagendagens simultâneas dupliquem notificações
// ---------------------------------------------------------------------------

let chain: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

// ---------------------------------------------------------------------------
// Preparação: canal, ações das notificações e permissões
// ---------------------------------------------------------------------------

export async function prepareNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
      name: 'Lembretes de saúde',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 350, 250, 350],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY_ALARM, [
    { identifier: ACTION_CONFIRM, buttonTitle: 'Tomei', options: { opensAppToForeground: true } },
    { identifier: ACTION_SNOOZE, buttonTitle: `Adiar ${SNOOZE_MINUTES} min`, options: { opensAppToForeground: true } },
  ]);
  await Notifications.setNotificationCategoryAsync(CATEGORY_TOLERANCE, [
    { identifier: ACTION_WHATSAPP, buttonTitle: 'WhatsApp', options: { opensAppToForeground: true } },
    { identifier: ACTION_SMS, buttonTitle: 'SMS', options: { opensAppToForeground: true } },
  ]);
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

async function deliveryOption() {
  return Platform.OS === 'android' && (await hasExactAlarmPermission())
    ? ({ delivery: 'alarmClock' } as const)
    : ({} as const);
}

// ---------------------------------------------------------------------------
// Conteúdo das notificações
// ---------------------------------------------------------------------------

function alarmContent(reminder: Reminder, extra: Partial<NotificationData> & { snoozed?: boolean } = {}) {
  return {
    title: extra.snoozed ? 'Lembrete adiado' : 'Hora do seu cuidado',
    body: reminder.title,
    sound: true,
    categoryIdentifier: CATEGORY_ALARM,
    data: { reminderId: reminder.id, kind: 'alarm', ...extra },
  } satisfies Notifications.NotificationContentInput;
}

function toleranceContent(reminder: Reminder, occurrence: number) {
  return {
    title: 'Lembrete sem confirmação',
    body: `Você não confirmou “${reminder.title}”. Toque para avisar a pessoa de confiança.`,
    sound: true,
    categoryIdentifier: CATEGORY_TOLERANCE,
    data: {
      reminderId: reminder.id,
      kind: 'tolerance',
      occurrence,
      phone: reminder.familyPhone,
      medicine: reminder.title,
    },
  } satisfies Notifications.NotificationContentInput;
}

function wantsFamilyAlert(reminder: Reminder) {
  return reminder.notifyFamily && reminder.familyPhone.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Agendar / cancelar (funções internas, sem fila)
// ---------------------------------------------------------------------------

async function cancelWhere(match: (d: NotificationData) => boolean) {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of pending) {
    const d = parseNotificationData(request.content.data);
    if (d && match(d)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined);
    }
  }
}

async function scheduleTolerance(reminder: Reminder, occurrence: Date) {
  const delivery = await deliveryOption();
  const fireAt = new Date(occurrence.getTime() + reminder.toleranceMinutes * MINUTE);
  await Notifications.scheduleNotificationAsync({
    content: toleranceContent(reminder, occurrence.getTime()),
    trigger: { type: T.DATE, date: fireAt, channelId: ALARM_CHANNEL, ...delivery },
  });
}

async function scheduleAll(reminder: Reminder) {
  const delivery = await deliveryOption();
  const [hour, minute] = parseTime(reminder.time);
  const occurrences = upcomingOccurrences(reminder);

  if (reminder.intervalHours && reminder.intervalHours > 0) {
    // Intervalo em horas: uma notificação por ocorrência dentro da janela.
    for (const when of occurrences) {
      await Notifications.scheduleNotificationAsync({
        content: alarmContent(reminder, { occurrence: when.getTime() }),
        trigger: { type: T.DATE, date: when, channelId: ALARM_CHANNEL, ...delivery },
      });
    }
  } else if (reminder.days.length === 0) {
    // Todos os dias: o próprio Android repete, mesmo sem abrir o app.
    await Notifications.scheduleNotificationAsync({
      content: alarmContent(reminder),
      trigger: { type: T.DAILY, hour, minute, channelId: ALARM_CHANNEL, ...delivery },
    });
  } else {
    // Dias escolhidos: um gatilho semanal por dia (weekday do Expo: 1 = domingo).
    for (const day of reminder.days) {
      await Notifications.scheduleNotificationAsync({
        content: alarmContent(reminder),
        trigger: { type: T.WEEKLY, weekday: day + 1, hour, minute, channelId: ALARM_CHANNEL, ...delivery },
      });
    }
  }

  if (wantsFamilyAlert(reminder)) {
    for (const when of occurrences) await scheduleTolerance(reminder, when);
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * (Re)agenda um lembrete. Preserva avisos à família de alarmes que já tocaram e
 * ainda não foram confirmados. Os ids não são mais guardados no banco: as
 * notificações são identificadas pelo reminderId que viaja dentro delas.
 */
export function scheduleReminder(reminder: Reminder): Promise<Reminder> {
  return serial(async () => {
    await cancelWhere((d) => d.reminderId === reminder.id && !(reminder.enabled && isAwaitingTolerance(d)));
    if (reminder.enabled) await scheduleAll(reminder);
    return { ...reminder, notificationId: undefined, toleranceNotificationId: undefined };
  });
}

/** Renova a janela de agendamento de todos os lembretes (chamar ao abrir/voltar ao app). */
export function refreshSchedules(reminders: Reminder[]) {
  return serial(async () => {
    const known = new Set(reminders.map((r) => r.id));
    // Remove órfãs (lembretes apagados) e tudo que será recriado agora.
    await cancelWhere((d) => !known.has(d.reminderId) || !isAwaitingTolerance(d));
    for (const reminder of reminders) {
      if (reminder.enabled) await scheduleAll(reminder);
    }
  });
}

export function cancelReminderNotifications(reminder: Reminder) {
  return serial(() => cancelWhere((d) => d.reminderId === reminder.id));
}

async function clearAwaitingAndDismiss(reminderId: string) {
  await cancelWhere((d) => d.reminderId === reminderId && isAwaitingTolerance(d));
  const shown = await Notifications.getPresentedNotificationsAsync();
  for (const n of shown) {
    const d = parseNotificationData(n.request.content.data);
    if (d?.reminderId === reminderId) {
      await Notifications.dismissNotificationAsync(n.request.identifier).catch(() => undefined);
    }
  }
}

/** A pessoa confirmou: cancela o aviso à família daquela ocorrência. */
export function confirmReminder(reminderId: string) {
  return serial(() => clearAwaitingAndDismiss(reminderId));
}

/** Adia: cancela o aviso atual e agenda um novo alarme (com o seu próprio aviso à família). */
export function snoozeReminder(reminder: Reminder, minutes = SNOOZE_MINUTES) {
  return serial(async () => {
    await clearAwaitingAndDismiss(reminder.id);
    const delivery = await deliveryOption();
    const when = new Date(Date.now() + minutes * MINUTE);
    await Notifications.scheduleNotificationAsync({
      content: alarmContent(reminder, { occurrence: when.getTime(), snoozed: true }),
      trigger: { type: T.DATE, date: when, channelId: ALARM_CHANNEL, ...delivery },
    });
    if (wantsFamilyAlert(reminder)) await scheduleTolerance(reminder, when);
  });
}

// ---------------------------------------------------------------------------
// Mensagem à pessoa de confiança
// ---------------------------------------------------------------------------

export function buildFamilyMessage(medicine: string, occurrence?: number) {
  let hour = '';
  if (occurrence) {
    const d = new Date(occurrence);
    hour = ` das ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `Aviso do Dose Certa: o lembrete “${medicine}”${hour} ainda não foi confirmado. Entre em contato para verificar se está tudo bem.`;
}

/**
 * Abre o WhatsApp (ou o SMS) com a mensagem pronta. O Android não permite enviar
 * sozinho: a pessoa precisa tocar em "enviar". Devolve false se nada pôde ser aberto.
 */
export async function notifyFamily(
  phone: string,
  medicine: string,
  via: 'whatsapp' | 'sms' = 'whatsapp',
  occurrence?: number,
): Promise<boolean> {
  const number = toInternationalNumber(phone);
  const text = encodeURIComponent(buildFamilyMessage(medicine, occurrence));
  const sms = `sms:+${number}?body=${text}`;
  // O esquema whatsapp:// falha se o app não estiver instalado (o https://wa.me abriria
  // o navegador), o que permite cair direto para o SMS.
  const attempts = via === 'sms' ? [sms] : [`whatsapp://send?phone=${number}&text=${text}`, sms];
  for (const url of attempts) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // tenta o próximo
    }
  }
  return false;
}
