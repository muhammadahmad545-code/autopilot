import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Engine, readLog } from './engine';
import type { LogEntry } from './types';

export function useLog(): [LogEntry[], () => void] {
  const [log, setLog] = useState<LogEntry[]>(readLog);
  useEffect(() => {
    const reload = () => setLog(readLog());
    const run = Engine.addListener('onRun', reload);
    const app = AppState.addEventListener('change', (s) => s === 'active' && reload());
    return () => {
      run.remove();
      app.remove();
    };
  }, []);
  return [log, () => setLog(readLog())];
}
