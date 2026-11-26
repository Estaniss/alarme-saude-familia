import React from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { maskPhoneBR, maskTime, normalizeTime, onlyNumbers } from '../utils/masks';

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
};

/** Horário 24h. Teclado numérico, insere o ":" sozinho e completa ao sair do campo. */
export function TimeInput({ value, onChangeText, onBlur, ...rest }: Props) {
  return (
    <TextInput
      placeholder="08:00"
      {...rest}
      value={value}
      keyboardType="number-pad"
      maxLength={5}
      onChangeText={(t) => onChangeText(maskTime(t))}
      onBlur={(e) => {
        onChangeText(normalizeTime(value));
        onBlur?.(e);
      }}
    />
  );
}

/** Telefone brasileiro com DDD: (16) 99999-8888. */
export function PhoneInput({ value, onChangeText, ...rest }: Props) {
  return (
    <TextInput
      placeholder="(16) 99999-8888"
      {...rest}
      value={value}
      keyboardType="phone-pad"
      textContentType="telephoneNumber"
      autoComplete="tel"
      maxLength={15}
      onChangeText={(t) => onChangeText(maskPhoneBR(t))}
    />
  );
}

/** Somente dígitos (intervalo em horas, minutos de tolerância). */
export function NumberInput({ value, onChangeText, maxLength = 3, ...rest }: Props) {
  return (
    <TextInput
      {...rest}
      value={value}
      keyboardType="number-pad"
      maxLength={maxLength}
      onChangeText={(t) => onChangeText(onlyNumbers(t, maxLength))}
    />
  );
}
