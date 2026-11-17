import React, { useEffect, useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import { AdFooter } from "./components/AdFooter";
import { ReminderCard } from "./components/ReminderCard";
import {
  cancelReminderNotifications,
  notifyFamily,
  prepareNotifications,
  requestExactAlarmPermission,
  scheduleReminder,
} from "./services/alarmService";
import {
  deleteReminder,
  initRepository,
  listReminders,
  saveReminder,
} from "./data/reminderRepository";
import { theme } from "./theme";
import { Reminder } from "./types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
const fresh = (): Reminder => ({
  id: `${Date.now()}`,
  title: "",
  time: "08:00",
  days: [],
  intervalHours: undefined,
  hasFired: false,
  sound: "default",
  enabled: true,
  notifyFamily: false,
  familyPhone: "",
  toleranceMinutes: 10,
});

export default function App() {
  const [items, setItems] = useState<Reminder[]>([]);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [active, setActive] = useState<Reminder | null>(null);

  const refresh = async () => setItems(await listReminders());
  useEffect(() => {
    (async () => {
      await initRepository();
      await prepareNotifications();
      const stored = await listReminders();
      const pendingIds = new Set(
        (await Notifications.getAllScheduledNotificationsAsync()).map(
          (n) => n.identifier,
        ),
      );
      for (const reminder of stored) {
        if (
          reminder.enabled &&
          (!reminder.notificationId || !pendingIds.has(reminder.notificationId))
        )
          await saveReminder(await scheduleReminder(reminder));
      }
      await refresh();
      await Notifications.setNotificationCategoryAsync("MEDICATION_ALARM", [
        {
          identifier: "CONFIRM",
          buttonTitle: "Tomei",
          options: { opensAppToForeground: true },
        },
        {
          identifier: "SNOOZE",
          buttonTitle: "Adiar 10 min",
          options: { opensAppToForeground: true },
        },
      ]);
    })();
    const received = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as any;
      if (data.kind === "alarm")
        void listReminders().then((rows) =>
          setActive(rows.find((i) => i.id === data.reminderId) ?? null),
        );
    });
    const response = Notifications.addNotificationResponseReceivedListener(
      async (r) => {
        const data = r.notification.request.content.data as any;
        if (data.kind === "tolerance") {
          await notifyFamily(String(data.phone), String(data.medicine));
          return;
        }
        const found = (await listReminders()).find(
          (i) => i.id === data.reminderId,
        );
        if (found && r.actionIdentifier === "CONFIRM") {
          if (found.toleranceNotificationId)
            await Notifications.cancelScheduledNotificationAsync(
              found.toleranceNotificationId,
            ).catch(() => undefined);
          await saveReminder(await scheduleReminder(found));
          await refresh();
        } else if (found && r.actionIdentifier === "SNOOZE") {
          setActive(found);
          void finishAlarm(true, found);
        } else if (found) setActive(found);
      },
    );
    return () => {
      received.remove();
      response.remove();
    };
  }, []);

  const persist = async (draft: Reminder) => {
    if (!draft.title.trim()) {
      Alert.alert("Informe o lembrete", "Digite o nome do remédio ou cuidado.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
      Alert.alert("Horário inválido", "Use o formato 24h, como 08:30.");
      return;
    }
    if (draft.notifyFamily && !draft.familyPhone.trim()) {
      Alert.alert(
        "Falta o contato",
        "Informe o telefone da pessoa de confiança.",
      );
      return;
    }
    const scheduled = await scheduleReminder(draft);
    await saveReminder(scheduled);
    await refresh();
    setEditing(null);
  };

  const toggle = async (item: Reminder, enabled: boolean) => {
    const changed = await scheduleReminder({ ...item, enabled });
    await saveReminder(changed);
    await refresh();
  };

  const finishAlarm = async (
    snooze = false,
    selected: Reminder | null = active,
  ) => {
    if (!selected) return;
    const item = selected;
    if (item.toleranceNotificationId)
      await Notifications.cancelScheduledNotificationAsync(
        item.toleranceNotificationId,
      ).catch(() => undefined);
    if (snooze) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Lembrete adiado",
          body: item.title,
          data: { reminderId: item.id, kind: "alarm" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 600,
          channelId: "medication-alarms",
        },
      });
      await saveReminder({
        ...item,
        hasFired: true,
        notificationId: id,
        toleranceNotificationId: undefined,
      });
    } else {
      await saveReminder(await scheduleReminder({ ...item, hasFired: true }));
    }
    setActive(null);
    await refresh();
  };

  const remove = async (item: Reminder) => {
    await cancelReminderNotifications(item);
    await deleteReminder(item.id);
    setEditing(null);
    await refresh();
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }}>
          <Text
            style={{
              color: theme.colors.primary,
              fontSize: 13,
              fontWeight: "700",
              letterSpacing: 1.1,
            }}
          >
            CUIDADO DIÁRIO
          </Text>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 30,
              fontWeight: "800",
              marginTop: 5,
            }}
          >
            Saúde & Família
          </Text>
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: 16,
              marginTop: 8,
              marginBottom: 22,
            }}
          >
            Seus lembretes, no seu ritmo.
          </Text>
          <Pressable
            onPress={() => void requestExactAlarmPermission()}
            style={({ pressed }) => ({
              minHeight: 50,
              justifyContent: "center",
              paddingHorizontal: 16,
              marginBottom: 18,
              borderRadius: 14,
              backgroundColor: theme.colors.soft,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text
              style={{ color: theme.colors.primaryDark, fontWeight: "700" }}
            >
              Configurar alarmes pontuais ›
            </Text>
            <Text
              style={{ color: theme.colors.muted, fontSize: 12, marginTop: 3 }}
            >
              Permissão do Android para horários exatos
            </Text>
          </Pressable>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 20,
                fontWeight: "700",
              }}
            >
              Seus lembretes
            </Text>
            <Pressable
              onPress={() => setEditing(fresh())}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: 48,
                paddingHorizontal: 16,
                justifyContent: "center",
                backgroundColor: theme.colors.primary,
                borderRadius: 14,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  color: theme.colors.white,
                  fontWeight: "700",
                  fontSize: 15,
                }}
              >
                + Novo
              </Text>
            </Pressable>
          </View>
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <ReminderCard
                item={item}
                onEdit={() => setEditing(item)}
                onToggle={(v) => void toggle(item, v)}
              />
            )}
            ListEmptyComponent={
              <View
                style={{
                  padding: 24,
                  borderRadius: 18,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 17,
                    fontWeight: "700",
                  }}
                >
                  Nenhum lembrete cadastrado
                </Text>
                <Text
                  style={{
                    color: theme.colors.muted,
                    marginTop: 8,
                    lineHeight: 22,
                  }}
                >
                  Adicione um remédio ou um lembrete para beber água.
                </Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
          />
        </View>
        <AdFooter />

        <Modal
          visible={!!editing}
          animationType="slide"
          onRequestClose={() => setEditing(null)}
        >
          {editing && (
            <SafeAreaView
              style={{ flex: 1, backgroundColor: theme.colors.background }}
            >
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 26,
                      fontWeight: "800",
                      marginBottom: 22,
                    }}
                  >
                    {items.some((i) => i.id === editing.id)
                      ? "Editar lembrete"
                      : "Novo lembrete"}
                  </Text>
                  <Field label="Remédio ou lembrete">
                    <TextInput
                      accessibilityLabel="Nome do remédio ou lembrete"
                      value={editing.title}
                      onChangeText={(title) =>
                        setEditing({ ...editing, title })
                      }
                      placeholder="Ex.: Vitamina D ou beber água"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Horário (24h)">
                    <TextInput
                      accessibilityLabel="Horário no formato 24 horas"
                      value={editing.time}
                      onChangeText={(time) => setEditing({ ...editing, time })}
                      keyboardType="numbers-and-punctuation"
                      placeholder="08:00"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Repetir a cada (horas, opcional)">
                    <TextInput
                      accessibilityLabel="Intervalo de repetição em horas"
                      value={
                        editing.intervalHours
                          ? String(editing.intervalHours)
                          : ""
                      }
                      onChangeText={(v) =>
                        setEditing({
                          ...editing,
                          days: v ? [] : editing.days,
                          intervalHours: v
                            ? Math.min(24, Math.max(1, Number(v) || 1))
                            : undefined,
                        })
                      }
                      keyboardType="number-pad"
                      placeholder="Ex.: 4"
                      style={inputStyle}
                    />
                  </Field>
                  <Text style={labelStyle}>Ou repetir nos dias</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                      marginBottom: 20,
                      opacity: editing.intervalHours ? 0.5 : 1,
                    }}
                  >
                    {["D", "S", "T", "Q", "Q", "S", "S"].map((label, d) => {
                      const selected = editing.days.includes(d);
                      return (
                        <Pressable
                          key={d}
                          disabled={!!editing.intervalHours}
                          accessibilityRole="checkbox"
                          accessibilityState={{
                            checked: selected,
                            disabled: !!editing.intervalHours,
                          }}
                          accessibilityLabel={
                            [
                              "domingo",
                              "segunda",
                              "terça",
                              "quarta",
                              "quinta",
                              "sexta",
                              "sábado",
                            ][d]
                          }
                          onPress={() =>
                            setEditing({
                              ...editing,
                              days: selected
                                ? editing.days.filter((x) => x !== d)
                                : [...editing.days, d].sort(),
                            })
                          }
                          style={{
                            width: 44,
                            height: 44,
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 22,
                            backgroundColor: selected
                              ? theme.colors.primary
                              : theme.colors.surface,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                          }}
                        >
                          <Text
                            style={{
                              color: selected
                                ? theme.colors.white
                                : theme.colors.text,
                              fontWeight: "700",
                            }}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Field label="Som da notificação">
                    <View style={[inputStyle, { justifyContent: "center" }]}>
                      <Text style={{ color: theme.colors.text }}>
                        Som padrão do sistema
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: theme.colors.muted,
                        fontSize: 13,
                        marginTop: 6,
                      }}
                    >
                      Áudios personalizados de voz precisam ser adicionados como
                      recursos nativos do Android.
                    </Text>
                  </Field>
                  <View style={switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={labelStyle}>
                        Notificar familiar se não confirmar
                      </Text>
                      <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                        O app prepara uma mensagem para você enviar.
                      </Text>
                    </View>
                    <Switch
                      value={editing.notifyFamily}
                      onValueChange={(notifyFamily) =>
                        setEditing({ ...editing, notifyFamily })
                      }
                      accessibilityLabel="Ativar aviso à pessoa de confiança"
                    />
                  </View>
                  {editing.notifyFamily && (
                    <>
                      <Field label="Telefone com código do país">
                        <TextInput
                          accessibilityLabel="Telefone do familiar com código do país"
                          value={editing.familyPhone}
                          onChangeText={(familyPhone) =>
                            setEditing({ ...editing, familyPhone })
                          }
                          keyboardType="phone-pad"
                          placeholder="5511999999999"
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="Tempo de tolerância (minutos)">
                        <TextInput
                          accessibilityLabel="Minutos de tolerância"
                          value={String(editing.toleranceMinutes)}
                          onChangeText={(v) =>
                            setEditing({
                              ...editing,
                              toleranceMinutes: Math.max(1, Number(v) || 1),
                            })
                          }
                          keyboardType="number-pad"
                          style={inputStyle}
                        />
                      </Field>{" "}
                      <Field label="Tempo de tolerância (minutos)">
                        <TextInput
                          accessibilityLabel="Minutos de tolerância"
                          value={String(editing.toleranceMinutes)}
                          onChangeText={(v) =>
                            setEditing({
                              ...editing,
                              toleranceMinutes: Math.max(1, Number(v) || 1),
                            })
                          }
                          keyboardType="number-pad"
                          style={inputStyle}
                        />
                      </Field>
                    </>
                  )}
                  <View
                    style={{ flexDirection: "row", gap: 10, marginTop: 12 }}
                  >
                    {items.some((i) => i.id === editing.id) && (
                      <Pressable
                        onPress={() =>
                          Alert.alert(
                            "Excluir lembrete?",
                            "O alarme agendado será cancelado.",
                            [
                              { text: "Cancelar" },
                              {
                                text: "Excluir",
                                style: "destructive",
                                onPress: () => void remove(editing),
                              },
                            ],
                          )
                        }
                        style={[actionStyle, { backgroundColor: "#F7E8E4" }]}
                      >
                        <Text
                          style={{
                            color: theme.colors.warning,
                            fontWeight: "700",
                          }}
                        >
                          Excluir
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => setEditing(null)}
                      style={[
                        actionStyle,
                        { backgroundColor: theme.colors.surface },
                      ]}
                    >
                      <Text
                        style={{ color: theme.colors.text, fontWeight: "700" }}
                      >
                        Cancelar
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void persist(editing)}
                      style={[
                        actionStyle,
                        { backgroundColor: theme.colors.primary },
                      ]}
                    >
                      <Text
                        style={{ color: theme.colors.white, fontWeight: "700" }}
                      >
                        Salvar
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          )}
        </Modal>

        <Modal
          visible={!!active}
          animationType="fade"
          onRequestClose={() => void finishAlarm()}
        >
          <SafeAreaView
            style={{
              flex: 1,
              backgroundColor: theme.colors.primaryDark,
              justifyContent: "center",
              padding: 28,
            }}
          >
            <Text
              style={{
                color: "#C3E3D7",
                fontSize: 15,
                fontWeight: "700",
                letterSpacing: 1.5,
              }}
            >
              HORA DO SEU CUIDADO
            </Text>
            <Text
              accessibilityRole="header"
              style={{
                color: theme.colors.white,
                fontSize: 34,
                fontWeight: "800",
                marginTop: 12,
              }}
            >
              {active?.title}
            </Text>
            <Text
              style={{
                color: "#E3F1EB",
                fontSize: 18,
                lineHeight: 27,
                marginTop: 12,
              }}
            >
              Quando estiver pronto, confirme seu lembrete.
            </Text>
            <Pressable
              onPress={() => void finishAlarm(false)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: 60,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: theme.colors.white,
                borderRadius: 18,
                marginTop: 44,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  color: theme.colors.primaryDark,
                  fontSize: 18,
                  fontWeight: "800",
                }}
              >
                Tomei / concluído
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void finishAlarm(true)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: 56,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#A7CBBE",
                borderRadius: 18,
                marginTop: 12,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text
                style={{
                  color: theme.colors.white,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                Adiar 10 minutos
              </Text>
            </Pressable>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Field({
  label,
  children,
}: React.PropsWithChildren<{ label: string }>) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={labelStyle}>{label}</Text>
      {children}
    </View>
  );
}
const labelStyle = {
  color: theme.colors.text,
  fontWeight: "700" as const,
  fontSize: 15,
  marginBottom: 8,
};
const inputStyle = {
  minHeight: 50,
  paddingHorizontal: 14,
  borderRadius: 13,
  borderColor: theme.colors.border,
  borderWidth: 1,
  backgroundColor: theme.colors.surface,
  color: theme.colors.text,
  fontSize: 16,
} as const;
const switchRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  backgroundColor: theme.colors.surface,
  borderRadius: 14,
  padding: 14,
  marginBottom: 16,
  gap: 8,
};
const actionStyle = {
  minHeight: 50,
  flex: 1,
  justifyContent: "center" as const,
  alignItems: "center" as const,
  paddingHorizontal: 12,
  borderRadius: 14,
};
