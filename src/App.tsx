import { useState } from 'react';
import { useAppStore } from '@/state/appStore';
import { NetworkLab } from '@/ui/components/NetworkLab';
import { MainMenu } from '@/ui/screens/MainMenu';
import { MatchScreen } from '@/ui/screens/MatchScreen';
import { OptionsScreen } from '@/ui/screens/OptionsScreen';
import { ResultScreen } from '@/ui/screens/ResultScreen';
import { MatchSyncProvider } from '@/ui/SyncContext';

export function App() {
  const screen = useAppStore((s) => s.screen);
  const matchKey = useAppStore((s) => s.matchKey);
  const [labOpen, setLabOpen] = useState(false);

  return (
    <MatchSyncProvider>
      <div className="app" data-screen={screen}>
        {screen === 'menu' && <MainMenu onOpenLab={() => setLabOpen(true)} />}
        {screen === 'options' && <OptionsScreen />}
        {screen === 'match' && <MatchScreen key={matchKey} />}
        {screen === 'result' && <ResultScreen />}
        <NetworkLab open={labOpen} onClose={() => setLabOpen(false)} />
      </div>
    </MatchSyncProvider>
  );
}
