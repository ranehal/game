import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocalStorage } from 'react-use';
import { HelpCircle, Share2, Users, Loader2, ArrowRight, RefreshCw, Trophy, Crown, Skull } from 'lucide-react';
import { gameManager } from './networking';
import type { RoomState } from './networking';
import { playSound } from './sounds';
import { useSwipeable } from 'react-swipeable';
import classNames from 'classnames';

// --- MAIN APP COMPONENT ---
export default function App() {
  const [gameState, setGameState] = useState<RoomState>(gameManager.getInitialState());
  const [playerName, setPlayerName] = useLocalStorage<string>('imposter_keda_name', '');
  const [roomIdInput, setRoomIdInput] = useState('');
  
  useEffect(() => {
    gameManager.onStateUpdate = setGameState;
    return () => {
      gameManager.disconnect();
    };
  }, []);

  const handleCreateRoom = () => {
    playSound('click');
    if (!playerName) return alert('Enter your name!');
    gameManager.initialize(playerName);
  };

  const handleJoinRoom = () => {
    playSound('click');
    if (!playerName) return alert('Enter your name!');
    if (!roomIdInput) return alert('Enter room ID!');
    gameManager.initialize(playerName, roomIdInput);
  };

  return (
    <div className="app-container">
      {/* Background Blobs */}
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <AnimatePresence mode="wait">
        {gameState.state === 'LOBBY' && !gameManager.peer && (
          <motion.div key="entry" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="glass p-6 flex flex-col gap-6 w-full max-w-md mx-auto mt-20">
            <h1 className="text-4xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400 mb-2">Imposter Keda?</h1>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-400 font-semibold uppercase tracking-wider">Your Name</label>
              <input value={playerName || ''} onChange={e => setPlayerName(e.target.value)} placeholder="e.g. Detective Pikachu" className="bg-slate-800/50 text-white placeholder:text-slate-500 rounded-xl p-4 border-2 border-slate-700/50 focus:border-rose-500 focus:outline-none transition-all" />
            </div>

            <button onClick={handleCreateRoom} className="bg-rose-500 hover:bg-rose-600 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-rose-500/30 transition-all flex items-center justify-center gap-2">
              <Crown className="w-5 h-5" /> Create New Room
            </button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-slate-700"></div>
              <span className="flex-shrink-0 mx-4 text-slate-500 text-sm font-medium">OR</span>
              <div className="flex-grow border-t border-slate-700"></div>
            </div>

            <div className="flex gap-2">
              <input value={roomIdInput} onChange={e => setRoomIdInput(e.target.value)} placeholder="Room ID" className="bg-slate-800/50 text-white placeholder:text-slate-500 rounded-xl p-4 border-2 border-slate-700/50 focus:border-rose-500 focus:outline-none transition-all flex-grow" />
              <button onClick={handleJoinRoom} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 px-6 rounded-xl transition-all">
                Join
              </button>
            </div>
          </motion.div>
        )}

        {gameState.state === 'LOBBY' && gameManager.peer && (
          <LobbyScreen state={gameState} />
        )}

        {gameState.state === 'ROLES' && (
          <RoleScreen state={gameState} />
        )}

        {gameState.state === 'PLAYING' && (
          <GameScreen state={gameState} />
        )}

        {gameState.state === 'VOTING' && (
          <VotingScreen state={gameState} />
        )}

        {gameState.state === 'RESULTS' && (
          <ResultsScreen state={gameState} />
        )}
      </AnimatePresence>

      <GodModeButton state={gameState} />
    </div>
  );
}

// --- SUB-COMPONENTS ---

function LobbyScreen({ state }: { state: RoomState }) {
  const [word, setWord] = useState('');
  const [chat, setChat] = useState('');

  const sendChat = () => {
    if (!chat.trim()) return;
    playSound('pop');
    gameManager.sendChat(chat);
    setChat('');
  };

  const startGame = () => {
    if (!word) return alert('Enter a secret word!');
    if (state.players.length < 3) return alert('Need at least 3 players!');
    playSound('dramatic');
    gameManager.sendAction('START_GAME', { word });
  };

  const copyLink = () => {
    playSound('click');
    navigator.clipboard.writeText(`${window.location.origin}?room=${state.roomId}`);
    alert('Invite link copied!');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 w-full max-w-lg mx-auto mt-10 h-[80vh]">
      <div className="glass p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Lobby</h2>
          <button onClick={copyLink} className="bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 p-2 rounded-lg text-sm flex items-center gap-2">
            <Share2 className="w-4 h-4" /> {state.roomId}
          </button>
        </div>
        
        <div className="flex gap-2 overflow-x-auto py-2">
          {state.players.map(p => (
            <div key={p.id} className="bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700/50 flex items-center gap-2 whitespace-nowrap">
              {p.isHost && <Crown className="w-4 h-4 text-yellow-500" />}
              <span className="font-medium">{p.name}</span>
            </div>
          ))}
          {state.players.length < 3 && (
            <div className="px-4 py-2 text-slate-500 text-sm flex items-center italic">Waiting for more...</div>
          )}
        </div>
      </div>

      <div className="glass p-6 flex flex-col flex-grow relative overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Users className="w-4 h-4"/> Room Chat</h3>
        <div className="chat-messages flex-grow overflow-y-auto mb-4 custom-scrollbar pr-2">
          {state.messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.sender === gameManager.myName ? 'mine' : 'others'}`}>
              <span className="text-xs opacity-50 block mb-1">{m.sender}</span>
              {m.text}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-auto">
          <input value={chat} onChange={e => setChat(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Say hi..." className="bg-slate-800/50 border-slate-700/50 focus:border-rose-500 rounded-xl p-3 text-white flex-grow" />
          <button onClick={sendChat} className="bg-rose-500 hover:bg-rose-600 text-white rounded-xl px-4 flex items-center justify-center">
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {gameManager.isHost && (
        <div className="glass p-6 mt-auto">
          <div className="flex flex-col gap-4">
            <input value={word} onChange={e => setWord(e.target.value)} placeholder="Enter Secret Word" className="bg-slate-800/50 border-slate-700/50 text-white rounded-xl p-4 text-center text-xl font-bold tracking-wider placeholder:font-normal placeholder:tracking-normal focus:border-emerald-500" />
            <button onClick={startGame} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/30 text-lg transition-all" disabled={state.players.length < 3}>
              Start Game
            </button>
          </div>
        </div>
      )}
      {!gameManager.isHost && (
        <div className="glass p-6 text-center text-slate-400 mt-auto flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Waiting for host to start...
        </div>
      )}
    </motion.div>
  );
}

function RoleScreen({ state }: { state: RoomState }) {
  const [revealed, setRevealed] = useState(false);
  const isImposter = state.imposterId === gameManager.myId;

  const handlers = useSwipeable({
    onSwipedRight: () => {
      if (!revealed) {
        playSound('swipe');
        setRevealed(true);
        setTimeout(() => {
          gameManager.sendAction('READY_PLAY'); // Simplification for prototype
          // Local override to jump to PLAYING screen after reveal.
          // Host should handle this in full game, but we force it here for speed.
          if (gameManager.isHost) gameManager.state.state = 'PLAYING';
          gameManager.broadcastState();
        }, 3000);
      }
    }
  });

  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center justify-center h-[80vh] w-full max-w-md mx-auto relative perspective-1000">
      
      {!revealed ? (
        <div className="glass p-8 flex flex-col items-center justify-center gap-8 w-full">
           <div className="w-32 h-48 bg-slate-800 rounded-xl border-2 border-slate-700 shadow-2xl relative overflow-hidden card-shuffle-container">
             <motion.div animate={{ rotateY: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-full h-full flex items-center justify-center text-4xl">❓</motion.div>
           </div>
           
           <div {...handlers} className="swipe-confirm cursor-grab w-full max-w-[250px] bg-slate-800/80 border border-slate-700">
             <div className="swipe-text text-sm tracking-widest uppercase">Swipe to Reveal</div>
             <motion.div className="swipe-thumb bg-rose-500 flex items-center justify-center shadow-lg" drag="x" dragConstraints={{ left: 0, right: 190 }} dragElastic={0} onDragEnd={(_, info) => { if (info.offset.x > 150) { playSound('swipe'); setRevealed(true); setTimeout(()=> { if (gameManager.isHost) gameManager.state.state = 'PLAYING'; gameManager.broadcastState(); }, 3000); } }}>
               <ArrowRight className="text-white w-6 h-6" />
             </motion.div>
           </div>
        </div>
      ) : (
        <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} className={classNames("glass p-10 flex flex-col items-center justify-center gap-6 w-full text-center border-4", isImposter ? "border-rose-500 bg-rose-500/10" : "border-emerald-500 bg-emerald-500/10")}>
          <h2 className="text-4xl font-black mb-2 uppercase tracking-widest">
            {isImposter ? <span className="text-rose-500 flex items-center gap-2"><Skull className="w-8 h-8"/> Imposter</span> : <span className="text-emerald-500">Townie</span>}
          </h2>
          
          <div className="bg-slate-900/50 p-6 rounded-2xl w-full border border-slate-700/50 shadow-inner">
            <p className="text-slate-400 text-sm font-semibold uppercase mb-2">Secret Word</p>
            <p className="text-3xl font-bold text-white tracking-widest">{isImposter ? '???' : state.secretWord}</p>
          </div>

          <p className="text-slate-400 mt-4 text-sm animate-pulse">Game starting in a moment...</p>
        </motion.div>
      )}
    </motion.div>
  );
}

function GameScreen({ state }: { state: RoomState }) {
  const handlePass = () => {
    playSound('pop');
    gameManager.sendAction('PASS_TURN');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-[80vh] max-w-md w-full mx-auto mt-10 gap-6">
      
      <div className="glass p-6 flex justify-between items-center bg-slate-800/40">
        <div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Round</span>
          <span className="text-2xl font-black text-rose-500">{state.round} / {state.maxRounds}</span>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Time Elapsed</span>
          <span className="text-lg font-mono text-slate-300">{Math.floor((Date.now() - state.startTime) / 60000)}m {Math.floor(((Date.now() - state.startTime) % 60000) / 1000)}s</span>
        </div>
      </div>

      <div className="flex-grow flex flex-col justify-center gap-4">
        {state.players.map(p => {
          const isTurn = p.id === state.currentTurnId;
          return (
            <motion.div key={p.id} animate={isTurn ? { scale: 1.05, borderColor: 'rgba(244, 63, 94, 0.8)' } : { scale: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }} className={classNames("glass p-4 border-2 transition-all flex justify-between items-center", isTurn ? "bg-rose-500/10 shadow-[0_0_30px_rgba(244,63,94,0.3)]" : "bg-slate-800/30")}>
              <div className="flex items-center gap-3">
                {isTurn ? <div className="w-3 h-3 bg-rose-500 rounded-full animate-ping" /> : <div className="w-3 h-3 bg-slate-600 rounded-full" />}
                <span className={classNames("font-bold text-lg", isTurn ? "text-white" : "text-slate-400")}>{p.name}</span>
              </div>
              
              {isTurn && p.id !== gameManager.myId && (
                <button onClick={handlePass} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded-full text-white font-semibold">
                  Pass Turn ({p.passedCount}/2)
                </button>
              )}
              {isTurn && p.id === gameManager.myId && (
                <span className="text-rose-400 font-bold text-sm animate-pulse">Give a hint!</span>
              )}
            </motion.div>
          );
        })}
      </div>

    </motion.div>
  );
}

function VotingScreen({ state }: { state: RoomState }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleVote = () => {
    if (!selectedId) return;
    playSound('vineBoom');
    gameManager.sendAction('VOTE', { targetId: selectedId });
  };

  const myPlayer = state.players.find(p => p.id === gameManager.myId);
  if (myPlayer?.votedFor) {
    return <div className="glass p-8 text-center mt-20 max-w-sm mx-auto"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-rose-500"/> Waiting for others to vote...</div>
  }

  return (
    <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col h-[80vh] max-w-md w-full mx-auto mt-10 gap-6">
      <div className="text-center mb-4">
        <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-widest">Voting Time</h2>
        <p className="text-slate-400">Who is the imposter?</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {state.players.map(p => {
          if (p.id === gameManager.myId) return null;
          return (
            <button key={p.id} onClick={() => { playSound('click'); setSelectedId(p.id); }} className={classNames("glass p-6 flex flex-col items-center justify-center gap-2 border-2 transition-all", selectedId === p.id ? "border-rose-500 bg-rose-500/20 shadow-lg shadow-rose-500/30 scale-105" : "border-slate-700 hover:border-slate-500 bg-slate-800/50")}>
              <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-xl font-bold text-white">
                {p.name.charAt(0)}
              </div>
              <span className="font-semibold text-white">{p.name}</span>
            </button>
          )
        })}
      </div>

      <button onClick={handleVote} disabled={!selectedId} className="mt-auto bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-500/30 text-lg transition-all">
        Confirm Vote
      </button>
    </motion.div>
  );
}

function ResultsScreen({ state }: { state: RoomState }) {
  const imposter = state.players.find(p => p.id === state.imposterId);
  
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col gap-6 max-w-md w-full mx-auto mt-10 text-center">
      
      <div className="glass p-8 border-4 border-rose-500 bg-rose-500/10 shadow-[0_0_50px_rgba(244,63,94,0.3)] relative overflow-hidden">
        <h2 className="text-2xl font-bold text-slate-300 uppercase tracking-widest mb-2">The Imposter was</h2>
        <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-500 mb-6">
          {imposter?.name}
        </div>
        
        <p className="text-slate-400 text-sm font-semibold uppercase">The secret word was</p>
        <p className="text-2xl font-bold text-white tracking-widest">{state.secretWord}</p>
      </div>

      <div className="glass p-6 bg-slate-800/50">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center justify-center gap-2"><Trophy className="text-yellow-500"/> Scores</h3>
        <div className="flex flex-col gap-3">
          {state.players.sort((a,b)=>b.score-a.score).map((p, i) => (
            <div key={p.id} className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
              <span className="font-semibold text-slate-300 flex items-center gap-2">
                <span className="text-slate-500 w-4">{i+1}.</span> {p.name} {p.id === state.imposterId && <Skull className="w-4 h-4 text-rose-500"/>}
              </span>
              <span className="font-mono text-emerald-400 font-bold">+{p.score}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => { playSound('click'); if(gameManager.isHost) { gameManager.state.state = 'LOBBY'; gameManager.broadcastState(); } }} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
        <RefreshCw className="w-5 h-5"/> Play Again (Same Room)
      </button>

    </motion.div>
  );
}

function GodModeButton({ state }: { state: RoomState }) {
  const [taps, setTaps] = useState(0);
  const [open, setOpen] = useState(false);

  const handleTap = () => {
    setTaps(prev => prev + 1);
    if (taps + 1 >= 5) {
      playSound('dramatic');
      setOpen(true);
      setTaps(0);
    }
  };

  if (open) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass bg-slate-900 border-rose-500 border-2 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-rose-500/30 pb-4">
            <h2 className="text-2xl font-black text-rose-500 flex items-center gap-2"><Crown className="w-6 h-6"/> GOD MODE ACTIVE</h2>
            <button onClick={() => setOpen(false)} className="bg-rose-500/20 text-rose-500 hover:bg-rose-500/40 p-2 rounded-lg">Close</button>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm font-mono">
             <div className="bg-slate-800 p-4 rounded-lg">
               <p className="text-rose-400 font-bold mb-2">Game State</p>
               <pre className="text-slate-300 overflow-x-auto">{JSON.stringify({
                 roomId: state.roomId, state: state.state, word: state.secretWord, imposter: state.imposterId
               }, null, 2)}</pre>
             </div>
             
             <div className="bg-slate-800 p-4 rounded-lg">
               <p className="text-emerald-400 font-bold mb-2">Players</p>
               <pre className="text-slate-300 overflow-x-auto">{JSON.stringify(state.players.map(p => ({
                 name: p.name, role: p.id === state.imposterId ? 'Imposter' : 'Townie', score: p.score, vote: p.votedFor
               })), null, 2)}</pre>
             </div>

             <div className="bg-slate-800 p-4 rounded-lg col-span-2">
               <p className="text-blue-400 font-bold mb-2">Chat Logs</p>
               <div className="max-h-32 overflow-y-auto">
                 {state.messages.map((m, i) => (
                   <div key={i}><span className="text-slate-500">[{new Date(m.time).toLocaleTimeString()}]</span> <span className="text-slate-300 font-bold">{m.sender}:</span> {m.text}</div>
                 ))}
               </div>
             </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <button onClick={handleTap} className="fixed bottom-6 right-6 w-12 h-12 bg-slate-800/50 hover:bg-slate-700/80 backdrop-blur-sm border border-slate-700/50 rounded-full flex items-center justify-center text-slate-400 hover:text-white shadow-lg z-40 transition-all">
      <HelpCircle className="w-6 h-6" />
    </button>
  );
}
