import React, { useState, useRef } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import {
  AuthFieldErrors,
  validateLoginEmail,
  validateLoginForm,
  validateLoginPassword,
} from '../../services/authService';
import { loginOwner } from '../../services/adminHttp';

interface LoginFormProps {
  onSuccessDemoEnter: () => void;
  emailInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccessDemoEnter,
  emailInputRef,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const internalEmailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const resolvedEmailRef = emailInputRef ?? internalEmailRef;

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (touched.email || errors.email) {
      const nextEmailError = validateLoginEmail(value);
      setErrors((prev) => ({
        ...prev,
        email: nextEmailError,
      }));
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (touched.password || errors.password) {
      const nextPasswordError = validateLoginPassword(value);
      setErrors((prev) => ({
        ...prev,
        password: nextPasswordError,
      }));
    }
  };

  const handleEmailBlur = () => {
    setTouched((prev) => ({ ...prev, email: true }));
    setErrors((prev) => ({
      ...prev,
      email: validateLoginEmail(email),
    }));
  };

  const handlePasswordBlur = () => {
    setTouched((prev) => ({ ...prev, password: true }));
    setErrors((prev) => ({
      ...prev,
      password: validateLoginPassword(password),
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = validateLoginForm(email, password);
    setTouched({ email: true, password: true });
    setErrors(validation.errors);

    if (!validation.isValid) {
      if (validation.errors.email) {
        resolvedEmailRef.current?.focus();
      } else if (validation.errors.password) {
        passwordRef.current?.focus();
      }
      return;
    }

    setIsSubmitting(true);

    try {
      await loginOwner(email, password);
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setErrors({});
      setTouched({ email: false, password: false });
      setIsSubmitting(false);
      onSuccessDemoEnter();
    } catch (error) {
      setErrors({ password: error instanceof Error ? error.message : 'Falha ao autenticar.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const emailErrorId = 'login-email-error';
  const passwordErrorId = 'login-password-error';

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-2.5">
      {/* Campo 1 — E-mail */}
      <div>
        <label
          htmlFor="login-email"
          className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
        >
          E-mail
        </label>
        <div className="relative">
          <Mail
            size={16}
            aria-hidden="true"
            className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
              errors.email
                ? 'text-rose-500 dark:text-rose-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          />
          <input
            ref={resolvedEmailRef}
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="seuemail@exemplo.com"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            onBlur={handleEmailBlur}
            disabled={isSubmitting}
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? emailErrorId : undefined}
            className="w-full h-12 sm:h-[50px] owner-input rounded-xl pl-10 pr-4 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
        <div className="mt-1.5 min-h-[20px] flex items-center">
          {errors.email && (
            <p
              id={emailErrorId}
              role="alert"
              className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-300 leading-tight"
            >
              <AlertCircle size={13} aria-hidden="true" className="shrink-0" />
              <span>{errors.email}</span>
            </p>
          )}
        </div>
      </div>

      {/* Campo 2 — Senha */}
      <div>
        <label
          htmlFor="login-password"
          className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
        >
          Senha
        </label>
        <div className="relative">
          <Lock
            size={16}
            aria-hidden="true"
            className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
              errors.password
                ? 'text-rose-500 dark:text-rose-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          />
          <input
            ref={passwordRef}
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            onBlur={handlePasswordBlur}
            disabled={isSubmitting}
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={errors.password ? passwordErrorId : undefined}
            className="w-full h-12 sm:h-[50px] owner-input rounded-xl pl-10 pr-11 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={isSubmitting}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={showPassword}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        </div>
        <div className="mt-1.5 min-h-[20px] flex items-center">
          {errors.password && (
            <p
              id={passwordErrorId}
              role="alert"
              className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-300 leading-tight"
            >
              <AlertCircle size={13} aria-hidden="true" className="shrink-0" />
              <span>{errors.password}</span>
            </p>
          )}
        </div>
      </div>

      {/* Botão Principal */}
      <div className="pt-1.5">
        <button
          type="submit"
          disabled={isSubmitting}
          className="owner-button owner-primary w-full min-h-12"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} aria-hidden="true" className="animate-spin" />
              <span>Entrando...</span>
            </>
          ) : (
            <>
              <span>Entrar</span>
              <ArrowRight size={16} aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      {/* Nota discreta do modo demonstrativo */}
      <p className="pt-1.5 text-[11.5px] leading-snug text-center text-slate-500 dark:text-slate-400">
        Utilize as credenciais Owner cadastradas no servidor.
      </p>
    </form>
  );
};
