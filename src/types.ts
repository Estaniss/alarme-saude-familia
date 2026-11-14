export type Reminder = {
  id: string;
  title: string;
  time: string; // HH:mm local
  days: number[]; // 0=domingo ... 6=sábado; [] = diário
  intervalHours?: number;
  hasFired?: boolean;
  sound: 'default' | 'gentle';
  enabled: boolean;
  notifyFamily: boolean;
  familyPhone: string;
  toleranceMinutes: number;
  notificationId?: string;
  toleranceNotificationId?: string;
};
