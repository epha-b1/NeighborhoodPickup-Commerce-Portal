import argon2 from 'argon2';

export const hashPassword = async (plainText: string): Promise<string> => {
  return argon2.hash(plainText, { type: argon2.argon2id });
};

export const verifyPassword = async (
  hashed: string,
  plainText: string
): Promise<boolean> => {
  return argon2.verify(hashed, plainText);
};