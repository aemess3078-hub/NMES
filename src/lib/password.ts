import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

const PASSWORD_STRENGTH_RE =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다."
  if (!PASSWORD_STRENGTH_RE.test(password))
    return "비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다."
  return null
}

export function generateTempPassword(): string {
  const lower = Math.random().toString(36).slice(2, 6)
  const upper = Math.random().toString(36).slice(2, 6).toUpperCase()
  const digits = Math.floor(Math.random() * 90 + 10).toString()
  const special = "!@#$%"[Math.floor(Math.random() * 5)]
  const raw = lower + upper + digits + special
  return raw.split("").sort(() => Math.random() - 0.5).join("")
}
