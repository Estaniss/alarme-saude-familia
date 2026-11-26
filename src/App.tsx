import React, { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Alert,
  AppState,
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
import { NumberInput, PhoneInput, TimeInput } from "./components/MaskedInputs";
import {
  ACTION_CONFIRM,
  ACTION_SMS,
  ACTION_SNOOZE,
  cancelReminderNotifications,
  confirmReminder,
  hasExactAlarmPermission,
  notifyFamily,
  parseNotificationData,
  prepareNotifications,
  refreshSchedules,
  requestExactAlarmPermission,
  scheduleReminder,
  snoozeReminder,
} from "./services/alarmService";
import { isValidPhoneBR, isValidTime } from "./utils/masks";
import {
  deleteReminder,
  initRepository,
  listReminders,
  saveReminder,
} from "./data/reminderRepository";
import { theme } from "./theme";
import { Reminder } from "./types";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = parseNotificationData(notification.request.content.data);
    // Com o app aberto, o aviso à família vira um alerta próprio (sem banner duplicado).
    const asksInApp = data?.kind === "tolerance";
    return {
      shouldShowBanner: !asksInApp,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

const MESSAGE_ERROR_TITLE = "Não foi possível abrir a mensagem";
const MESSAGE_ERROR_BODY =
  "Verifique se o WhatsApp ou o aplicativo de SMS está instalado neste aparelho.";

async function sendFamilyMessage(
  phone: string,
  medicine: string,
  via: "whatsapp" | "sms",
  occurrence?: number,
) {
  const ok = await notifyFamily(phone, medicine, via, occurrence);
  if (!ok) Alert.alert(MESSAGE_ERROR_TITLE, MESSAGE_ERROR_BODY);
}

function askToNotifyFamily(phone: string, medicine: string, occurrence?: number) {
  Alert.alert(
    "Lembrete sem confirmação",
    `Você não confirmou “${medicine}”. Avisar a pessoa de confiança?`,
    [
      { text: "Agora não", style: "cancel" },
      { text: "SMS", onPress: () => void sendFamilyMessage(phone, medicine, "sms", occurrence) },
      { text: "WhatsApp", onPress: () => void sendFamilyMessage(phone, medicine, "whatsapp", occurrence) },
    ],
  );
}
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

  const refresh = useCallback(async () => {
    const rows = await listReminders();
    setItems(rows);
    return rows;
  }, []);

  // null = ainda verificando. Sem a permissão, o Android pode atrasar o alarme em até 1 hora.
  const [exactOk, setExactOk] = useState<boolean | null>(null);
  const checkExact = useCallback(async () => {
    setExactOk(await hasExactAlarmPermission());
  }, []);

  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponses = useRef(new Set<string>());

  useEffect(() => {
    (async () => {
      await initRepository();
      await prepareNotifications();
      await checkExact();
      const stored = await refresh();
      // Renova a janela de agendamentos (alarmes por intervalo e avisos à família).
      await refreshSchedules(stored);
    })().catch((error) => console.warn("Falha ao iniciar o app", error));

    const received = Notifications.addNotificationReceivedListener((n) => {
      const data = parseNotificationData(n.request.content.data);
      if (!data) return;
      if (data.kind === "alarm") {
        void listReminders().then((rows) =>
          setActive(rows.find((i) => i.id === data.reminderId) ?? null),
        );
      } else if (data.phone) {
        askToNotifyFamily(data.phone, data.medicine ?? "lembrete", data.occurrence);
      }
    });

    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void checkExact();
      void listReminders().then((rows) => {
        setItems(rows);
        return refreshSchedules(rows);
      });
    });

    return () => {
      received.remove();
      appState.remove();
    };
  }, [refresh, checkExact]);

  // Toques em notificações e nos botões delas (inclusive com o app fechado).
  useEffect(() => {
    if (!lastResponse) return;
    const { notification, actionIdentifier } = lastResponse;
    const key = `${notification.request.identifier}:${actionIdentifier}:${notification.date}`;
    if (handledResponses.current.has(key)) return;
    handledResponses.current.add(key);

    (async () => {
      const data = parseNotificationData(notification.request.content.data);
      if (!data) return;

      if (data.kind === "tolerance") {
        if (!data.phone) return;
        const via = actionIdentifier === ACTION_SMS ? "sms" : "whatsapp";
        await sendFamilyMessage(data.phone, data.medicine ?? "lembrete", via, data.occurrence);
        return;
      }

      const found = (await listReminders()).find((i) => i.id === data.reminderId);
      if (!found) return;
      if (actionIdentifier === ACTION_CONFIRM) {
        await confirmReminder(found.id);
        await refresh();
      } else if (actionIdentifier === ACTION_SNOOZE) {
        await snoozeReminder(found);
        await refresh();
      } else {
        setActive(found);
      }
    })().catch((error) => console.warn("Falha ao tratar a notificação", error));
  }, [lastResponse, refresh]);

  const persist = async (draft: Reminder) => {
    if (!draft.title.trim()) {
      Alert.alert("Informe o lembrete", "Digite o nome do remédio ou cuidado.");
      return;
    }
    if (!isValidTime(draft.time)) {
      Alert.alert("Horário inválido", "Use o formato 24h, como 08:30.");
      return;
    }
    if (draft.notifyFamily) {
      if (!isValidPhoneBR(draft.familyPhone)) {
        Alert.alert(
          "Telefone inválido",
          "Informe o DDD e o número da pessoa de confiança, como (16) 99999-8888.",
        );
        return;
      }
      if (draft.toleranceMinutes < 1) {
        Alert.alert("Tolerância inválida", "Informe quantos minutos esperar (de 1 a 120).");
        return;
      }
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

  const finishAlarm = async (snooze = false, selected: Reminder | null = active) => {
    if (!selected) return;
    if (snooze) await snoozeReminder(selected);
    else await confirmReminder(selected.id);
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
          {exactOk === false && (
            <Pressable
              onPress={() => void requestExactAlarmPermission()}
              accessibilityRole="button"
              accessibilityLabel="Ativar alarmes exatos. Sem isso o Android pode atrasar os lembretes."
              style={({ pressed }) => ({
                minHeight: 56,
                justifyContent: "center",
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginBottom: 18,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.warning,
                backgroundColor: "#FBEFEA",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: theme.colors.warning, fontWeight: "700" }}>
                Ative os alarmes exatos ›
              </Text>
              <Text
                style={{ color: theme.colors.text, fontSize: 13, marginTop: 3 }}
              >
                Sem essa permissão, o Android pode atrasar seus lembretes em até
                1 hora. Toque para ativar e depois volte ao app.
              </Text>
            </Pressable>
          )}
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
                    <TimeInput
                      accessibilityLabel="Horário no formato 24 horas"
                      value={editing.time}
                      onChangeText={(time) => setEditing({ ...editing, time })}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Repetir a cada (horas, opcional)">
                    <NumberInput
                      maxLength={2}
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
                        Você recebe um aviso para enviar uma mensagem à pessoa de confiança.
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
                      <Field label="Telefone com DDD">
                        <PhoneInput
                          accessibilityLabel="Telefone do familiar com DDD"
                          value={editing.familyPhone}
                          onChangeText={(familyPhone) =>
                            setEditing({ ...editing, familyPhone })
                          }
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="Tempo de tolerância (minutos)">
                        <NumberInput
                          accessibilityLabel="Minutos de tolerância"
                          value={
                            editing.toleranceMinutes
                              ? String(editing.toleranceMinutes)
                              : ""
                          }
                          onChangeText={(v) =>
                            setEditing({
                              ...editing,
                              toleranceMinutes: Math.min(120, Number(v) || 0),
                            })
                          }
                          placeholder="10"
                          style={inputStyle}
                        />
                        <Text
                          style={{
                            color: theme.colors.muted,
                            fontSize: 13,
                            marginTop: 6,
                          }}
                        >
                          Se você não confirmar nesse prazo, o app avisa para
                          enviar a mensagem por WhatsApp ou SMS.
                        </Text>
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
          onRequestClose={() => setActive(null)}
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
