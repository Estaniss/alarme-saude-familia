import type { Reminder } from '../types';

/** Quantos dias à frente os avisos de tolerância e os alarmes por intervalo ficam agendados. */
export const WINDOW_DAYS = 7;
/** Teto de ocorrências por lembrete (o Android limita o total de alarmes por app). */
export const MAX_OCCURRENCES = 30;

const HOUR = 60 * 60_000;

export function parseTime(time: string): [number, number] {
  const [h, m] = time.split(':').map(Number);
  return [h || 0, m || 0];
}

/**
 * Próximas ocorrências do lembrete dentro da janela.
 * - Com intervalo: sequência fixa ancorada no horário ("08:00, a cada 4h" => 08, 12, 16...).
 * - Sem intervalo: o horário nos dias escolhidos (ou todos os dias).
 */
export function upcomingOccurrences(
  reminder: Pick<Reminder, 'time' | 'days' | 'intervalHours'>,
  from = new Date(),
): Date[] {
  const [hour, minute] = parseTime(reminder.time);
  const minTime = from.getTime() + 1000;
  const horizon = from.getTime() + WINDOW_DAYS * 24 * HOUR;
  const out: Date[] = [];

  if (reminder.intervalHours && reminder.intervalHours > 0) {
    const step = reminder.intervalHours * HOUR;
    const anchor = new Date(from);
    anchor.setHours(hour, minute, 0, 0);
    let t = anchor.getTime();
    if (t < minTime) t += Math.ceil((minTime - t) / step) * step;
    while (t <= horizon && out.length < MAX_OCCURRENCES) {
      out.push(new Date(t));
      t += step;
    }
    return out;
  }

  for (let offset = 0; offset <= WINDOW_DAYS && out.length < MAX_OCCURRENCES; offset++) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    const validDay = reminder.days.length === 0 || reminder.days.includes(candidate.getDay());
    if (validDay && candidate.getTime() >= minTime) out.push(candidate);
  }
  return out;
}
