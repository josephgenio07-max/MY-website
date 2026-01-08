// lib/phone.ts
export function toE164UK(input: string): string | null {
  if (!input) return null;
  const raw = input.trim();

  if (raw.startsWith("+")) {
    const cleaned = "+" + raw.slice(1).replace(/\D/g, "");
    return cleaned.length >= 8 ? cleaned : null;
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("0")) return "+44" + digits.slice(1);
  if (digits.startsWith("44")) return "+" + digits;

  return null;
}
