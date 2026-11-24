import { useState } from 'react';
import { OperationSettingsForm } from '../components/OperationSettingsForm';
import { adminRequest, clearAdminCsrf } from '../services/adminHttp';
import { PrivacyRequestsPanel } from '../components/PrivacyRequestsPanel';

interface SettingsPageProps {
  onSessionEnded: () => void;
  theme: 'light' | 'dark' | 'system';
  onThemeChange: (value: SettingsPageProps['theme']) => void;
  onLimitsSaved: () => void;
}

export function SettingsPage({ onSessionEnded, theme, onThemeChange, onLimitsSaved }: SettingsPageProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  return <div className="space-y-4 owner-settings-compact">
    <header><h1 className="owner-title">Configurações</h1><p className="owner-muted">Operação, aparência e segurança do painel</p></header>
    <OperationSettingsForm onLimitsSaved={onLimitsSaved} />
    <PrivacyRequestsPanel />
    <section className="owner-panel p-5 space-y-3">
      <h2 className="owner-heading">Aparência</h2>
      <label className="owner-field max-w-xs"><span>Preferência de tema</span>
      <select value={theme} onChange={event => onThemeChange(event.target.value as SettingsPageProps['theme'])}>
        <option value="system">Seguir sistema</option>
        <option value="light">Claro</option>
        <option value="dark">Escuro</option>
      </select>
      </label>
    </section>
    <form className="owner-panel p-5 space-y-3" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const form = new FormData(event.currentTarget);
      const currentPassword = String(form.get('currentPassword') ?? '');
      const newPassword = String(form.get('newPassword') ?? '');
      if (newPassword !== form.get('confirmation')) {
        setError('As novas senhas não coincidem.');
        return;
      }
      setBusy(true);
      setError('');
      try {
        await adminRequest('/api/admin/auth/change-password', {
          method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
        });
        clearAdminCsrf();
        onSessionEnded();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Falha ao alterar a senha.');
      } finally { setBusy(false); }
    }}>
      <h2 className="owner-heading">Segurança da conta</h2>
      <p className="owner-muted">Use de 14 a 128 caracteres. A troca de senha encerra as sessões existentes.</p>
      {error && <p role="alert">{error}</p>}
      <fieldset className="space-y-3" disabled={busy}>
        <label className="block">Senha atual
          <input name="currentPassword" type={showPasswords ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} className="owner-input block p-2 rounded-xl" />
        </label>
        <label className="block">Nova senha
          <input name="newPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" required minLength={14} maxLength={128} className="owner-input block p-2 rounded-xl" />
        </label>
        <label className="block">Confirmar nova senha
          <input name="confirmation" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" required minLength={14} maxLength={128} className="owner-input block p-2 rounded-xl" />
        </label>
        <label className="owner-check"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} /> Mostrar senhas</label>
        <button className="owner-button owner-primary">{busy ? 'Alterando…' : 'Alterar senha'}</button>
      </fieldset>
    </form>
  </div>;
}
