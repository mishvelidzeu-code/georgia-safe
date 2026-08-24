import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import WelcomeScreen from './WelcomeScreen';
import OnboardingScreen from './OnboardingScreen';
import LoginScreen from './LoginScreen';

type Step = 'welcome' | 'onboarding' | 'login';

/**
 * Everything a tourist sees before reaching the tabs. Plain local state
 * rather than a second navigator: this is a short linear flow with no deep
 * links or back-stack of its own, so a stack navigator (and the extra native
 * dependency it would pull in) would buy nothing here.
 */
export default function AuthFlow() {
  const { session, completeOnboarding, continueAsGuest } = useAuth();
  // Someone who signed up but whose profile write failed lands here with a
  // session already in place — skip straight to finishing the profile rather
  // than offering "get started / log in" again.
  const [step, setStep] = useState<Step>(session ? 'onboarding' : 'welcome');

  if (step === 'login') {
    return (
      <LoginScreen
        // A returning user's profile already lives server-side, so logging in
        // is enough to consider onboarding done on this device.
        onLoggedIn={completeOnboarding}
        onGoToSignUp={() => setStep('onboarding')}
      />
    );
  }

  if (step === 'onboarding') {
    return (
      <OnboardingScreen
        alreadyAuthenticated={session !== null}
        onDone={completeOnboarding}
        onGoToLogin={() => setStep('login')}
      />
    );
  }

  return (
    <WelcomeScreen
      onStart={() => setStep('onboarding')}
      onLogin={() => setStep('login')}
      onGuest={() => void continueAsGuest()}
    />
  );
}
