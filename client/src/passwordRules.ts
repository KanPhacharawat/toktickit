// Client mirror of the password rules (Lab 3 BR-13), for the live checklist on
// Change Password. The server re-checks everything; this only gives feedback.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export interface PasswordRule {
  id: "length" | "case" | "numberSpecial" | "notEmail" | "different";
  label: string;
  met: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function passwordRules(
  newPassword: string,
  { email, currentPassword }: { email: string; currentPassword?: string },
): PasswordRule[] {
  const characters = [...newPassword].length;
  const bytes = new TextEncoder().encode(newPassword).length;

  const rules: PasswordRule[] = [
    {
      id: "length",
      label: `Be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
      met: characters >= PASSWORD_MIN && characters <= PASSWORD_MAX && bytes <= PASSWORD_MAX,
    },
    {
      id: "case",
      label: "Include upper and lower case letters",
      met: /\p{Lu}/u.test(newPassword) && /\p{Ll}/u.test(newPassword),
    },
    {
      id: "numberSpecial",
      label: "Include a number and a special character",
      met: /\p{Nd}/u.test(newPassword) && /[^\p{L}\p{Nd}]/u.test(newPassword),
    },
    {
      id: "notEmail",
      label: "Not be your email address",
      met: newPassword.length > 0 && newPassword.toLowerCase() !== email.trim().toLowerCase(),
    },
  ];

  if (currentPassword !== undefined) {
    rules.push({
      id: "different",
      label: "Be different from your current password",
      met: newPassword.length > 0 && newPassword !== currentPassword,
    });
  }

  return rules;
}
