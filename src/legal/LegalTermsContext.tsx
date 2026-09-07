import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import LegalTermsModal from '../components/LegalTermsModal';

type LegalTermsContextValue = {
  openTerms: () => void;
};

const LegalTermsContext = createContext<LegalTermsContextValue | null>(null);

export function LegalTermsProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const openTerms = useCallback(() => setVisible(true), []);
  const closeTerms = useCallback(() => setVisible(false), []);
  const value = useMemo(() => ({ openTerms }), [openTerms]);

  return (
    <LegalTermsContext.Provider value={value}>
      {children}
      <LegalTermsModal visible={visible} onClose={closeTerms} />
    </LegalTermsContext.Provider>
  );
}

export function useLegalTerms(): LegalTermsContextValue {
  const context = useContext(LegalTermsContext);
  if (!context) throw new Error('useLegalTerms must be used within a LegalTermsProvider');
  return context;
}
