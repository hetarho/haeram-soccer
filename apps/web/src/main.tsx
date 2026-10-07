import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { GameClient, type ClientState } from './runtime/client';
function App() {
  const [state, setState] = useState<ClientState>();
  const [client, setClient] = useState<GameClient>();
  useEffect(() => {
    const c = new GameClient(setState);
    setClient(c);
    void c.start();
    return () => c.dispose();
  }, []);
  return (
    <main>
      <h1>Haeram Football Archives</h1>
      <p>1901년, 우리 클럽의 첫 페이지.</p>
      {state?.notice && <p role="status">{state.notice}</p>}
      {state?.error && <p role="alert">{state.error}</p>}
      {!state?.view ? (
        <button
          disabled={!state || state.busy || state.readonly}
          onClick={() =>
            void client?.found({
              country: 'ENG',
              name: 'Haeram Athletic',
              color: '#24664f',
              seed: 'web-worker',
              difficulty: 1,
            })
          }
        >
          클럽 창단
        </button>
      ) : (
        <>
          <h2>{state.view.world.clubs.find((c) => c.id === state.view!.world.playerClub)?.name}</h2>
          <p>
            시즌 {state.view.world.year} · 라운드 {state.view.world.round}
          </p>
          <button
            disabled={state.busy || state.readonly}
            onClick={() => void client?.command({ type: 'advance', rounds: 1 })}
          >
            다음 라운드
          </button>
          <p>저장 완료: {state.savedRevision}</p>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
