// Reglas de contraseña sin dependencias de servidor (se usan también en formularios del cliente).

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Devuelve un mensaje de error en español o null si la contraseña cumple la política. */
export function checkPasswordPolicy(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX) return `La contraseña no puede tener más de ${PASSWORD_MAX} caracteres.`;
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Usa letras y al menos un número.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) return "La contraseña no puede contener tu correo.";
  return null;
}
