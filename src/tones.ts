import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Tone, TONES, ToneId } from '../data/tones';
import { theme } from '../theme';

type Props = {
  value: ToneId;
  onChange: (tone: ToneId) => void;
  /** Agenda um alarme de teste com o toque escolhido. */
  onTest: () => void;
};

/** A pré-escuta para sozinha depois de alguns segundos. */
const PREVIEW_MS = 8000;

export function TonePicker({ value, onChange, onTest }: Props) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [playing, setPlaying] = useState<ToneId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = () => {
    clearTimeout(timer.current);
    player.pause();
    setPlaying(null);
  };

  useEffect(() => {
    if (status.didJustFinish) {
      clearTimeout(timer.current);
      setPlaying(null);
    }
  }, [status.didJustFinish]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const choose = (tone: Tone) => {
    onChange(tone.id);
    if (!tone.preview) {
      stop();
      return;
    }
    if (playing === tone.id) {
      stop();
      return;
    }
    clearTimeout(timer.current);
    player.replace(tone.preview);
    player.play();
    setPlaying(tone.id);
    timer.current = setTimeout(stop, PREVIEW_MS);
  };

  return (
    <View style={{ gap: 8 }}>
      {TONES.map((tone) => {
        const selected = tone.id === value;
        return (
          <Pressable
            key={tone.id}
            onPress={() => choose(tone)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${tone.label}. ${tone.description}`}
            style={({ pressed }) => ({
              minHeight: 60,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? theme.colors.primary : theme.colors.border,
              backgroundColor: selected ? theme.colors.soft : theme.colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: selected ? theme.colors.primary : theme.colors.muted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {selected && (
                <View
                  style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary }}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>{tone.label}</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13, marginTop: 2 }}>{tone.description}</Text>
            </View>
            {tone.preview && (
              <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '700' }}>
                {playing === tone.id ? '■ Parar' : '▶ Ouvir'}
              </Text>
            )}
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => {
          stop();
          onTest();
        }}
        accessibilityRole="button"
        style={({ pressed }) => ({
          minHeight: 52,
          marginTop: 4,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 15 }}>
          Testar alarme em 10 segundos
        </Text>
      </Pressable>
      <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
        O alarme toca no volume de alarme do celular. A pré-escuta usa o volume de mídia.
      </Text>
    </View>
  );
}
