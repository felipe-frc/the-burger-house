export interface AuthFieldErrors {
  email?: string;
  password?: string;
}

export interface AuthValidationResult {
  isValid: boolean;
  errors: AuthFieldErrors;
}


const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateLoginEmail(email: string): string | undefined {
  const normalized = email.trim();
  if (!normalized) {
    return 'Informe seu e-mail.';
  }
  if (!EMAIL_FORMAT_REGEX.test(normalized)) {
    return 'Digite um e-mail válido.';
  }
  return undefined;
}

export function validateLoginPassword(password: string): string | undefined {
  if (!password.trim()) {
    return 'Informe sua senha.';
  }
  return undefined;
}

export function validateLoginForm(
  email: string,
  password: string
): AuthValidationResult {
  const emailError = validateLoginEmail(email);
  const passwordError = validateLoginPassword(password);

  const errors: AuthFieldErrors = {};
  if (emailError) {
    errors.email = emailError;
  }
  if (passwordError) {
    errors.password = passwordError;
  }

  return {
    isValid: !emailError && !passwordError,
    errors,
  };
}
