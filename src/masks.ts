export type ToneId =
  | 'sino'
  | 'suave'
  | 'despertador'
  | 'digital'
  | 'gota'
  | 'urgente'
  | 'sistema';

export type Tone = {
  id: ToneId;
  label: string;
  description: string;
  /** Nome do arquivo em res/raw (declarado em "sounds" no app.json). null = som do sistema. */
  file: string | null;
  /** Fonte para a pré-escuta dentro do app. null = sem pré-escuta. */
  preview: number | null;
};

export const DEFAULT_TONE: ToneId = 'sino';

export const TONES: Tone[] = [
  {
    id: 'sino',
    label: 'Sino',
    description: 'Badalada clara, fácil de reconhecer',
    file: 'tom_sino.mp3',
    preview: require('../../assets/sounds/tom_sino.mp3'),
  },
  {
    id: 'suave',
    label: 'Suave',
    description: 'Três notas calmas, sem susto',
    file: 'tom_suave.mp3',
    preview: require('../../assets/sounds/tom_suave.mp3'),
  },
  {
    id: 'gota',
    label: 'Gota',
    description: 'Duas notas curtas e delicadas',
    file: 'tom_gota.mp3',
    preview: require('../../assets/sounds/tom_gota.mp3'),
  },
  {
    id: 'despertador',
    label: 'Despertador',
    description: 'Bips rápidos, como um relógio digital',
    file: 'tom_despertador.mp3',
    preview: require('../../assets/sounds/tom_despertador.mp3'),
  },
  {
    id: 'digital',
    label: 'Digital',
    description: 'Quatro notas subindo',
    file: 'tom_digital.mp3',
    preview: require('../../assets/sounds/tom_digital.mp3'),
  },
  {
    id: 'urgente',
    label: 'Urgente',
    description: 'Mais alto e insistente, para quem tem sono pesado',
    file: 'tom_urgente.mp3',
    preview: require('../../assets/sounds/tom_urgente.mp3'),
  },
  {
    id: 'sistema',
    label: 'Padrão do celular',
    description: 'Usa o som de notificação do aparelho',
    file: null,
    preview: null,
  },
];

export function getTone(id: ToneId): Tone {
  return TONES.find((t) => t.id === id) ?? (TONES.find((t) => t.id === DEFAULT_TONE) as Tone);
}

/** Converte valores antigos do banco ('default', 'gentle') e qualquer valor desconhecido. */
export function normalizeTone(value: unknown): ToneId {
  if (value === 'gentle') return 'suave';
  return TONES.some((t) => t.id === value) ? (value as ToneId) : DEFAULT_TONE;
}
