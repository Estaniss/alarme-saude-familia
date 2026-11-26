/** Máscaras e validações dos campos do formulário. Sem dependências nativas. */

const onlyDigits = (v: string) => v.replace(/\D/g, '');

// ---------- Horário (HH:mm, 24h) ----------

/** Aplica a máscara enquanto a pessoa digita: "0830" -> "08:30". */
export function maskTime(raw: string) {
  const d = onlyDigits(raw).slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Completa o valor ao sair do campo: "8" -> "08:00", "830" -> "08:30". */
export function normalizeTime(raw: string) {
  const d = onlyDigits(raw).slice(0, 4);
  if (d.length === 0) return '';
  if (d.length <= 2) return `${d.padStart(2, '0')}:00`;
  if (d.length === 3) return `0${d[0]}:${d.slice(1)}`;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

export function isValidTime(v: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

// ---------- Telefone (Brasil) ----------

/** Remove o DDI 55 quando o número foi salvo no formato antigo (5511999999999). */
function nationalDigits(v: string) {
  const d = onlyDigits(v);
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
}

/** "16999998888" -> "(16) 99999-8888". Aceita fixo (10 dígitos) e celular (11). */
export function maskPhoneBR(raw: string) {
  const d = nationalDigits(raw).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhoneBR(v: string) {
  const d = nationalDigits(v);
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11) return false;
  return d.length === 10 || (d.length === 11 && d[2] === '9');
}

/** Número no formato exigido pelo wa.me e pelo sms: (com 55, sem símbolos). */
export function toInternationalNumber(v: string) {
  return `55${nationalDigits(v)}`;
}

// ---------- Número inteiro ----------

export function onlyNumbers(v: string, maxLength = 3) {
  return onlyDigits(v).slice(0, maxLength);
}
