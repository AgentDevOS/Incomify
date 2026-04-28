import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import AuthErrorAlert from './AuthErrorAlert';
import AuthInputField from './AuthInputField';
import AuthScreenLayout from './AuthScreenLayout';

type SetupFormState = {
  email: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
};

const initialState: SetupFormState = {
  email: '',
  password: '',
  confirmPassword: '',
  inviteCode: '',
};
type SetupFormProps = {
  onShowLogin?: () => void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the account-setup form state.
 * @returns An error message string if validation fails, or `null` when the
 *   form is valid.
 */
function validateSetupForm(formState: SetupFormState, t: (key: string) => string): string | null {
  if (!formState.email.trim() || !formState.password || !formState.confirmPassword || !formState.inviteCode.trim()) {
    return t('register.errors.requiredFields');
  }

  if (!EMAIL_PATTERN.test(formState.email.trim())) {
    return t('register.errors.invalidEmail');
  }

  if (formState.password.length < 6) {
    return t('register.errors.weakPassword');
  }

  if (formState.password !== formState.confirmPassword) {
    return t('register.errors.passwordMismatch');
  }

  return null;
}

/**
 * Account setup / registration form.
 * Uses `autoComplete="new-password"` on password fields so that password
 * managers recognise this as a registration flow and offer to save the new
 * credentials after submission.
 */
export default function SetupForm({ onShowLogin }: SetupFormProps) {
  const { t } = useTranslation('auth');
  const { register } = useAuth();
  const baseUrl = import.meta.env.BASE_URL;

  const [formState, setFormState] = useState<SetupFormState>(initialState);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback((field: keyof SetupFormState, value: string) => {
    setFormState((previous) => ({ ...previous, [field]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorMessage('');

      const validationError = validateSetupForm(formState, t);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }

      setIsSubmitting(true);
      const result = await register(formState.email.trim(), formState.password, formState.inviteCode.trim());
      if (!result.success) {
        setErrorMessage(result.error);
      }
      setIsSubmitting(false);
    },
    [formState, register, t],
  );

  return (
    <AuthScreenLayout
      title={t('register.title')}
      description={t('register.description')}
      footerText={t('register.footer')}
      logo={<img src={`${baseUrl}logo.svg`} alt="CloudCLI" className="h-16 w-16" />}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInputField
          id="email"
          name="email"
          label={t('register.email')}
          value={formState.email}
          onChange={(value) => updateField('email', value)}
          placeholder={t('register.placeholders.email')}
          isDisabled={isSubmitting}
          type="email"
          autoComplete="username"
        />
        <p className="-mt-2 text-xs leading-5 text-muted-foreground">
          {t('register.emailVerificationNotice')}
        </p>

        <AuthInputField
          id="password"
          name="password"
          label={t('register.password')}
          value={formState.password}
          onChange={(value) => updateField('password', value)}
          placeholder={t('register.placeholders.password')}
          isDisabled={isSubmitting}
          type="password"
          autoComplete="new-password"
        />

        <AuthInputField
          id="confirmPassword"
          name="confirmPassword"
          label={t('register.confirmPassword')}
          value={formState.confirmPassword}
          onChange={(value) => updateField('confirmPassword', value)}
          placeholder={t('register.placeholders.confirmPassword')}
          isDisabled={isSubmitting}
          type="password"
          autoComplete="new-password"
        />

        <AuthInputField
          id="inviteCode"
          name="inviteCode"
          label={t('register.inviteCode')}
          value={formState.inviteCode}
          onChange={(value) => updateField('inviteCode', value)}
          placeholder={t('register.placeholders.inviteCode')}
          isDisabled={isSubmitting}
          autoComplete="off"
        />

        <AuthErrorAlert errorMessage={errorMessage} />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-colors duration-200 hover:bg-blue-700 disabled:bg-blue-400"
        >
          {isSubmitting ? t('register.loading') : t('register.submit')}
        </button>
      </form>

      {onShowLogin ? (
        <button
          type="button"
          onClick={onShowLogin}
          className="mt-4 w-full text-center text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {t('register.signIn')}
        </button>
      ) : null}
    </AuthScreenLayout>
  );
}
