import * as SQLite from 'expo-sqlite';
import { Reminder } from '../types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | undefined;
const db = () => (dbPromise ??= SQLite.openDatabaseAsync('health-reminders.db'));

export async function initRepository() {
  const database = await db();
  await database.execAsync(`CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, time TEXT NOT NULL, days TEXT NOT NULL,
    sound TEXT NOT NULL, enabled INTEGER NOT NULL, notifyFamily INTEGER NOT NULL,
    familyPhone TEXT NOT NULL, toleranceMinutes INTEGER NOT NULL, intervalHours INTEGER,
    hasFired INTEGER NOT NULL DEFAULT 0,
    notificationId TEXT, toleranceNotificationId TEXT
  );`);
}

export async function listReminders(): Promise<Reminder[]> {
  const database = await db();
  const rows = await database.getAllAsync<any>('SELECT * FROM reminders ORDER BY time ASC');
  return rows.map((row) => ({
    ...row, days: JSON.parse(row.days), enabled: Boolean(row.enabled), notifyFamily: Boolean(row.notifyFamily), hasFired: Boolean(row.hasFired),
  }));
}

export async function saveReminder(item: Reminder) {
  const database = await db();
  await database.runAsync(
    `INSERT OR REPLACE INTO reminders
    (id,title,time,days,sound,enabled,notifyFamily,familyPhone,toleranceMinutes,intervalHours,hasFired,notificationId,toleranceNotificationId)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    item.id, item.title, item.time, JSON.stringify(item.days), item.sound, Number(item.enabled),
    Number(item.notifyFamily), item.familyPhone, item.toleranceMinutes, item.intervalHours ?? null, Number(item.hasFired ?? false),
    item.notificationId ?? null, item.toleranceNotificationId ?? null,
  );
}

export async function deleteReminder(id: string) {
  await (await db()).runAsync('DELETE FROM reminders WHERE id = ?', id);
}
