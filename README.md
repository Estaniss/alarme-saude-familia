# Alarme de Saúde & Família

Starter Android em React Native + Expo Dev Client, com lembretes locais, SQLite, tela de confirmação, tolerância familiar e AdMob.

## Escolhas e limites

- `expo-notifications` agenda notificações locais pelo Android `AlarmManager`; um serviço JavaScript permanente não é necessário para o lembrete tocar.
- A entrega exata requer `SCHEDULE_EXACT_ALARM` concedida nas configurações do sistema em Android 12+. No Android 14+, instalações novas começam sem essa permissão. A opção `USE_EXACT_ALARM` é reservada a apps que se enquadram nas categorias permitidas pelo Google Play; este starter não a declara.
- Android/OEM pode atrasar notificações se o usuário restringir o app, e o force-stop impede a entrega até o app ser aberto novamente. Não existe garantia absoluta contra políticas do fabricante.
- O alerta de tolerância é uma segunda notificação local. Ela permite abrir um link `wa.me` ou `sms:` pré-preenchido. Android/WhatsApp não permitem que um app envie uma mensagem silenciosamente sem confirmação do usuário.
- A tela de alarme abre quando a pessoa toca na notificação. Para abrir uma Activity em tela cheia sem toque, seria necessário um módulo nativo com `fullScreenIntent` e cumprir a política Android/Google Play; este starter não solicita `SYSTEM_ALERT_WINDOW`.
- O código usa o som padrão do canal Android. Áudio de voz escolhido pelo usuário não está implementado: para tocar com o app encerrado, o arquivo precisa ser copiado para `android/app/src/main/res/raw` e configurado no canal/notificação nativa. Um seletor de arquivo isolado não garante reprodução em background.
- Expo SQLite persiste alarmes. Os IDs de notificações ficam no banco para cancelar e atualizar agendamentos.

## Criar e executar

Use Node LTS, Android Studio/SDK e um dispositivo/emulador Android. Expo Go não serve: AdMob e notificações nativas exigem um development build.

```bash
npx create-expo-app@latest alarme-saude-familia --template blank-typescript
cd alarme-saude-familia
npx expo install expo-dev-client expo-notifications expo-sqlite expo-linking expo-constants
npm install react-native-google-mobile-ads
```

Copie `app.json` e a pasta `src/` deste starter para o projeto recém-criado. Defina os App IDs reais do AdMob no `app.json` antes do build. Para desenvolvimento, use IDs de teste do Google.

Configure o ID de unidade de banner de produção no ambiente de build como `EXPO_PUBLIC_ADMOB_BANNER_ID`. Durante `__DEV__`, o app usa o banner de teste oficial da biblioteca.

```bash
npx expo prebuild --clean
npx expo run:android
```

Depois de alterar plugins/permissões nativas, gere um novo development build. Não use `expo start` em Expo Go para validar essas funções.

## Dependências e configuração

```json
{
  "expo": {
    "plugins": [
      ["expo-notifications", { "sounds": ["./assets/sounds/soft-alarm.wav"] }],
      [
        "react-native-google-mobile-ads",
        {
          "androidAppId": "ca-app-pub-3940256099942544~3347511713"
        }
      ]
    ],
    "android": {
      "permissions": ["android.permission.SCHEDULE_EXACT_ALARM"]
    }
  }
}
```

O App ID mostrado é de teste. Troque-o pelo App ID cadastrado no AdMob e configure IDs de unidades de anúncio próprios. Não publique usando IDs de teste.

## Arquivos

```text
src/
  App.tsx                     # Home, formulário e tela de alarme
  theme.ts                    # tokens visuais
  types.ts                    # modelo de lembrete
  data/reminderRepository.ts  # SQLite
  services/alarmService.ts    # permissões e notificações locais
  components/ReminderCard.tsx
  components/AdFooter.tsx
```

## Fluxo

1. Na primeira execução, o app cria o canal `medication-alarms`, pede permissão de notificações e explica a permissão de alarmes exatos.
2. Criar/editar lembrete salva no SQLite e agenda os disparos. Sem intervalo, o próprio Android repete o alarme (gatilho diário ou semanal), mesmo sem abrir o app. Com intervalo de 1–24 horas, o app agenda as próximas ocorrências em uma janela de até 7 dias (máx. 30) e renova a janela sempre que o app é aberto.
3. O disparo aparece como notificação, com os botões "Tomei" e "Adiar 10 min". Confirmar cancela o aviso à família daquela ocorrência; adiar agenda um novo alarme com o seu próprio aviso.
4. Com familiar ativado, cada ocorrência ganha uma notificação adicional em `horário + tolerância`, com os botões "WhatsApp" e "SMS". Tocar abre o app de mensagens com o texto preenchido (`whatsapp://` com queda para `sms:`). Com o app aberto, aparece um alerta perguntando como avisar. O Android não permite envio sem toque: a pessoa ainda precisa apertar "enviar".
5. Os avisos à família dependem da janela agendada; se o app não for aberto por mais de uma semana, deixam de ser renovados (o alarme principal continua).

## Manifesto Android

Com `expo prebuild`, os plugins e `android.permissions` acima geram o manifesto. O trecho correspondente é:

```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

`POST_NOTIFICATIONS` é solicitado em runtime pelo Android 13+ via `requestPermissionsAsync`. O plugin adiciona `RECEIVE_BOOT_COMPLETED` para restaurar notificações agendadas. Não declare `SYSTEM_ALERT_WINDOW`: abrir overlays sobre outros apps é invasivo e não é necessário para uma notificação de alarme. `USE_FULL_SCREEN_INTENT` também não é declarado neste starter.

Se optar por bare React Native/Notifee para `fullScreenAction`, configure o `AndroidManifest.xml`, canal com importância máxima e `USE_FULL_SCREEN_INTENT` apenas após validar o caso de uso e as regras de distribuição. A permissão não garante que o sistema abrirá a Activity em todos os estados.

## Qualidade e operação

- Teste em aparelho físico, inclusive após reinício, modo Doze, tela bloqueada e concessão/revogação de acesso a alarmes exatos.
- Oriente a pessoa a permitir notificações e, quando disponível, remover restrições de bateria para uso confiável. Caminhos variam por fabricante.
- Reagende ao criar/editar/excluir e ao abrir o app; confira a permissão exata novamente ao voltar das configurações.
- Os alarmes sem intervalo usam gatilhos recorrentes do Android. Alarmes por intervalo e avisos à família usam uma janela móvel renovada ao abrir o app. Para renovar sem interação, implemente uma tarefa em segundo plano ou um receiver nativo.
- A tela adapta-se a fontes maiores, usa rótulos acessíveis e áreas de toque de pelo menos 48 dp.
- AdMob: o banner de rodapé está implementado. Antes da distribuição, integre consentimento (UMP) conforme região/políticas e inicialize o SDK depois desse fluxo. O starter não mostra interstitial nem rewarded no fluxo de confirmação: anúncios que atrasem uma ação relacionada à saúde podem prejudicar o uso; se adotados, devem ser opt-in, fora do alarme e sem bloquear a tela.

## Referências oficiais

- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Android: permissões de alarmes exatos](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms)
- [react-native-google-mobile-ads](https://docs.page/invertase/react-native-google-mobile-ads)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
