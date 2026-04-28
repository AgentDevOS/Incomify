import type { ReactNode } from 'react';
import { useState } from 'react';
import { IS_PLATFORM } from '../../../constants/config';
import { useAuth } from '../context/AuthContext';
import Onboarding from '../../onboarding/view/Onboarding';
import AuthLoadingScreen from './AuthLoadingScreen';
import LoginForm from './LoginForm';
import SetupForm from './SetupForm';

type ProtectedRouteProps = {
  children: ReactNode;
};

type AuthMode = 'login' | 'register';

function AuthEntryScreen({ initialMode }: { initialMode: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  if (mode === 'register') {
    return <SetupForm onShowLogin={() => setMode('login')} />;
  }

  return <LoginForm onShowRegister={() => setMode('register')} />;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading, needsSetup, hasCompletedOnboarding, refreshOnboardingStatus } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (IS_PLATFORM) {
    if (!hasCompletedOnboarding) {
      return <Onboarding onComplete={refreshOnboardingStatus} />;
    }

    return <>{children}</>;
  }

  if (!user) {
    return <AuthEntryScreen initialMode={needsSetup ? 'register' : 'login'} />;
  }

  if (!hasCompletedOnboarding) {
    return <Onboarding onComplete={refreshOnboardingStatus} />;
  }

  return <>{children}</>;
}
