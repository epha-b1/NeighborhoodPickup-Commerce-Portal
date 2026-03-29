const complexityChecks = [
  /[a-z]/,
  /[A-Z]/,
  /[0-9]/,
  /[^A-Za-z0-9]/
];

export const passwordPolicyMessage =
  'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.';

export const isPasswordPolicyValid = (password: string): boolean => {
  return password.length >= 12 && complexityChecks.every((regex) => regex.test(password));
};