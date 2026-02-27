import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, type User 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion
} from 'firebase/firestore';
import { 
  Users, Copy, Play, SkipForward, MessageSquare, HelpCircle, 
  Settings, History, Clock, Skull, Eye, Moon, Sun, Send, Home, UserCheck, Link
} from 'lucide-react';

// --- TYPES ---
interface Player {
  name: string;
  score: number;
  role: string;
  isReady: boolean;
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
  imposter: string;
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
  imposterId: string;
  round: number;
  maxRounds: number;
  players: Record<string, Player>;
  turnOrder: string[];
  currentTurnIndex: number;
  votes: Record<string, string>;
  chats: ChatMessage[];
  historyLog: HistoryEntry[];
}

interface UserProfile {
  name: string;
  history: string[];
}

// --- FIREBASE SETUP ---
declare const __firebase_config: string;
declare const __app_id: string;
declare const __initial_auth_token: string;

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "placeholder",
  authDomain: "placeholder",
  projectId: "placeholder",
  storageBucket: "placeholder",
  messagingSenderId: "placeholder",
  appId: "placeholder"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'imposter-keda-app';

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

// --- GEMINI API HELPER ---
const callGemini = async (prompt: string, asJsonArray = false) => {
  const apiKey = ""; // Injected by environment
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  const payload: any = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  
  if (asJsonArray) {
    payload.generationConfig = { 
        responseMimeType: "application/json",
        responseSchema: { type: "ARRAY", items: { type: "STRING" } }
    };
  }

  let retries = 5;
  let delay = 1000;
  while (retries > 0) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return asJsonArray ? JSON.parse(text) : text;
    } catch (e) {
      retries--;
      if (retries === 0) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
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

// --- BACKGROUND PARTICLES COMPONENT ---
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

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile>({ name: '', history: [] });
  const [nameInput, setNameInput] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Clocks
  const [pageTime, setPageTime] = useState(0);
  const [roomTime, setRoomTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Local UI State
  const [, setHintClicks] = useState(0);
  const [showGodMode, setShowGodMode] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [revealedRole, setRevealedRole] = useState(false);
  const [, setCardPicked] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Theme state for imposter
  const [isImposterTheme, setIsImposterTheme] = useState(false);

  // --- AI States ---
  const [aiRoast, setAiRoast] = useState('');
  const [isGeneratingRoast, setIsGeneratingRoast] = useState(false);

  // --- P2P Chat State ---
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

  // Auth & Profile Init
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Auth error:", e); }
    };
    initAuth();

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const pRef = doc(db, 'artifacts', appId, 'users', u.uid, 'profile', 'data');
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          setProfile(pSnap.data() as UserProfile);
          setNameInput((pSnap.data() as UserProfile).name || '');
        } else {
          const newProfile: UserProfile = { name: '', history: [] };
          await setDoc(pRef, newProfile);
          setProfile(newProfile);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // URL checking for direct join
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const rId = urlParams.get('room');
    if (rId && !roomId) {
      setRoomId(rId);
    }
  }, []);

  // Room Listener
  useEffect(() => {
    if (!user || !roomId) return;
    
    const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const unsub = onSnapshot(rRef, (snap) => {
      if (snap.exists()) {
        const rData = snap.data() as Room;
        setRoom(rData);
        if (room && room.state !== rData.state && rData.state === 'lobby') {
           setRoomTime(0);
           setRevealedRole(false);
           setCardPicked(false);
           setIsImposterTheme(false);
        }
        if (rData.state === 'playing' && revealedRole) {
           const myRole = rData.players[user.uid]?.role;
           setIsImposterTheme(myRole === 'Imposter');
        }

        const others = Object.keys(rData.players).filter(id => id !== user.uid);
        if (others.length > 0) {
            setSelectedChatUser(prev => prev && others.includes(prev) ? prev : others[0]);
        } else {
            setSelectedChatUser(null);
        }
      } else {
        setRoom(null);
      }
    }, (error) => console.error("Room sync error:", error));

    return () => unsub();
  }, [user, roomId, revealedRole]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.chats, selectedChatUser]);

  const saveNameAndEnter = async () => {
    if (!nameInput.trim()) return;
    const newName = nameInput.trim();
    setProfile(p => ({ ...p, name: newName }));
    if (!user) return;
    const pRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
    await updateDoc(pRef, { name: newName, history: arrayUnion(newName) });
  };

  const selectPreviousName = async (newName: string) => {
    setNameInput(newName);
    setProfile(p => ({ ...p, name: newName }));
    if (!user) return;
    const pRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
    await updateDoc(pRef, { name: newName });
  };

  const createRoom = async () => {
    if (!user) return;
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', newId);
    
    const initialRoom: Room = {
      id: newId,
      hostId: user.uid,
      state: 'lobby',
      category: 'Food',
      word: '',
      imposterId: '',
      round: 1,
      maxRounds: 3,
      players: {
        [user.uid]: { name: profile.name, score: 0, role: '', isReady: false, passedTurn: [] }
      },
      turnOrder: [],
      currentTurnIndex: 0,
      votes: {},
      chats: [],
      historyLog: []
    };

    await setDoc(rRef, initialRoom);
    setRoomId(newId);
    setRoomTime(0);
    try { window.history.pushState({}, '', `?room=${newId}`); } catch(e) { console.warn("History pushState blocked in iframe", e); }
  };

  const joinRoom = async (idToJoin = roomId) => {
    if (!user || !idToJoin) return;
    const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', idToJoin);
    const snap = await getDoc(rRef);
    if (snap.exists()) {
      await updateDoc(rRef, {
        [`players.${user.uid}`]: { name: profile.name, score: 0, role: '', isReady: false, passedTurn: [] }
      });
      setRoomId(idToJoin);
      setRoomTime(0);
      try { window.history.pushState({}, '', `?room=${idToJoin}`); } catch(e) { console.warn("History pushState blocked in iframe", e); }
    } else {
      alert("Room not found!");
      setRoomId('');
    }
  };

  const leaveRoom = () => {
    setRoomId('');
    setRoom(null);
    try { window.history.pushState({}, '', window.location.pathname); } catch(e) { console.warn("History pushState blocked in iframe", e); }
  };

  const copyInviteLink = () => {
    try {
      let link = `${window.location.origin}${window.location.pathname}?room=${room!.id}`;
      if (link.startsWith('blob:')) link = room!.id;
      
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

  const generateAiRoast = async () => {
     setIsGeneratingRoast(true);
     try {
         const chatLog = (room!.chats || []).filter(c => c.sender !== 'System').map(c => `${c.sender}: ${c.msg}`).join('\n');
         const prompt = `You are a sassy, humorous game commentator for an Imposter word game. The game just ended. 
         Details:
         - The Imposter was: ${room!.players[room!.imposterId]?.name}
         - The Secret Word was: ${room!.word}
         - Result: The imposter ${room!.votes[user!.uid] === room!.imposterId ? 'lost and was caught' : 'won and tricked everyone'}.
         - Chat Log during the game (if any):
         ${chatLog || "(No one talked in chat, it was a silent, awkward game.)"}
         
         Write a short, funny 2-3 sentence roast or summary of the game. Call out funny things from the chat or roast the imposter's performance. Keep it punchy, casual, and playful!`;
         
         const roast = await callGemini(prompt, false);
         setAiRoast(roast);
     } catch (e) {
         console.error("Gemini roast failed", e);
         setAiRoast("The AI was too stunned by this gameplay to formulate a comment.");
     } finally {
         setIsGeneratingRoast(false);
     }
  };

  const startGame = async () => {
    if (!user || !room) return;
    playSound('alert');
    const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room.id);
    
    const pIds = Object.keys(room.players);
    const words = CATEGORIES[room.category] || CATEGORIES['Food'];
    const secretWord = words[Math.floor(Math.random() * words.length)];
    
    const imposterIndex = Math.floor(Math.random() * pIds.length);
    const imposterId = pIds[imposterIndex];

    const updatedPlayers = { ...room.players };
    pIds.forEach(id => {
      updatedPlayers[id].role = (id === imposterId) ? 'Imposter' : 'Crew';
      updatedPlayers[id].passedTurn = [];
    });

    await updateDoc(rRef, {
      state: 'playing',
      word: secretWord,
      imposterId: imposterId,
      players: updatedPlayers,
      turnOrder: pIds.sort(() => Math.random() - 0.5),
      currentTurnIndex: 0,
      votes: {},
      chats: [...(room.chats||[]), { sender: 'System', msg: 'Game Started! Shuffling roles...', time: Date.now() }]
    });
  };

  const sendChat = async (e: any) => {
    e.preventDefault();
    if (!chatMsg.trim() || !user || !room || !selectedChatUser) return;
    const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room.id);
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
      const nc = c + 1;
      if (nc >= 5) {
        setShowGodMode(true);
        playSound('alert');
        return 0;
      }
      return nc;
    });
  };

  const passTurn = async (targetId: string) => {
     if (!user || !room) return;
     const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room.id);
     
     const targetPlayer = room.players[targetId];
     const currentlyPassedBy = targetPlayer.passedTurn || [];
     
     if (!currentlyPassedBy.includes(user.uid)) {
         const newPassedBy = [...currentlyPassedBy, user.uid];
         await updateDoc(rRef, {
             [`players.${targetId}.passedTurn`]: newPassedBy
         });
         
         if (newPassedBy.length >= 2) {
             nextTurn();
         }
     }
  };

  const nextTurn = async () => {
     if (!user || !room) return;
     const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room.id);
     
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
         state: nextState
     });
  };

  const castVote = async (targetId: string) => {
     if (!user || !room) return;
     const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room.id);
     await updateDoc(rRef, {
         [`votes.${user.uid}`]: targetId
     });
     
     const totalPlayers = Object.keys(room.players).length;
     const currentVotes = Object.keys(room.votes || {}).length + 1;
     
     if (currentVotes >= totalPlayers) {
         calculateResults(targetId);
     }
  };

  const calculateResults = async (lastVoteTarget: string) => {
      const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room!.id);
      
      const allVotes = { ...room!.votes, [user!.uid]: lastVoteTarget };
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

      const imposterCaught = votedOutId === room!.imposterId;
      const updatedPlayers = { ...room!.players };
      
      let winMsg = "";
      if (imposterCaught) {
          winMsg = "Crew Wins! The Imposter was caught!";
          Object.keys(updatedPlayers).forEach(pId => {
              if (pId !== room!.imposterId) updatedPlayers[pId].score += 10;
          });
      } else {
          winMsg = `Imposter Wins! They evaded capture. (It was ${room!.players[room!.imposterId]?.name})`;
          updatedPlayers[room!.imposterId].score += 20;
      }

      const historyEntry: HistoryEntry = {
          date: new Date().toISOString(),
          imposter: room!.players[room!.imposterId]?.name,
          word: room!.word,
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
     const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room.id);
     await updateDoc(rRef, {
         state: 'lobby',
         round: 1,
         votes: {},
         imposterId: '',
         word: '',
         turnOrder: [],
         currentTurnIndex: 0
     });
     setAiRoast('');
     setCardPicked(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-yellow-200 text-black font-black text-4xl animate-bounce">LOADING...</div>;

  const appClasses = `min-h-screen font-sans transition-colors duration-500 overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-white ${isImposterTheme ? '!bg-red-950/80 !text-red-50' : ''}`;

  return (
    <div className={`${darkMode ? 'dark' : ''}`}>
      <div className={appClasses}>
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: -20, pointerEvents: 'none' }}>
          <Particles
            particleColors={["#ffffff", "#fde047", "#22d3ee", "#d946ef"]}
            particleCount={150}
            speed={0.4}
            moveParticlesOnHover={true}
          />
        </div>

        <header className={`fixed top-0 w-full p-2 z-50 flex justify-between items-start pointer-events-none`}>
          <div className="flex gap-2 pointer-events-auto">
             <AnimatedThemeToggler isDark={darkMode} onToggle={() => setDarkMode(!darkMode)} />
             <button onClick={handleGodModeTrigger} className="p-3 bg-pink-300 border-4 border-black dark:border-white rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:translate-y-1 transition-transform group relative">
               <HelpCircle size={20} className="text-black group-hover:animate-spin" />
             </button>
          </div>
          <div className="flex flex-col gap-1 items-end pointer-events-auto">
             <div className="bg-white dark:bg-slate-800 border-4 border-black dark:border-slate-700 rounded-xl px-3 py-1 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] flex items-center gap-1">
               <Clock size={12}/> {currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </div>
             <div className="bg-lime-300 dark:bg-lime-600 border-4 border-black dark:border-slate-700 rounded-xl px-3 py-1 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] flex items-center gap-1">
               <Eye size={12}/> Page: {formatTime(pageTime)}
             </div>
             {room && (
               <div className="bg-cyan-300 dark:bg-cyan-700 border-4 border-black dark:border-slate-700 rounded-xl px-3 py-1 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] flex items-center gap-1">
                 <Play size={12}/> Room: {formatTime(roomTime)}
               </div>
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
                    <h3 className="font-bold text-xl">Imposter ID: <span className="text-red-600">{room.imposterId || 'Not set'}</span></h3>
                  </div>
                  <div className="bg-yellow-200 dark:bg-yellow-800 p-4 border-4 border-black dark:border-slate-700 rounded-xl">
                    <h3 className="font-bold mb-2 uppercase">Players & Roles:</h3>
                    {Object.entries(room.players).map(([id, p]) => (
                      <div key={id} className="flex justify-between border-b-2 border-black/20 dark:border-white/20 py-1">
                        <span>{p.name} {id === room.hostId && '(Host)'}</span>
                        <span className={`font-black ${p.role === 'Imposter' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>{p.role || 'Waiting'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bg-cyan-200 dark:bg-cyan-900 p-4 border-4 border-black dark:border-slate-700 rounded-xl">
                    <h3 className="font-bold mb-2 uppercase">Raw Logs:</h3>
                    <pre className="text-xs overflow-x-auto p-2 bg-black text-lime-400 rounded-lg">
                      {JSON.stringify(room, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="font-bold text-xl text-center p-10">Join a room first to see secrets!</p>
              )}
            </NeoPanel>
          </div>
        )}

        <main className="pt-24 pb-20 px-4 max-w-4xl mx-auto flex flex-col gap-6 relative z-10 min-h-[90vh]">
          
          {!profile.name ? (
            <div className="flex flex-col gap-8 items-center justify-center min-h-[60vh]">
              <NeoPanel className="w-full max-w-md flex flex-col gap-6 !p-8 items-center text-center animate-float">
                <UserCheck size={64} className="text-fuchsia-500 mb-2" />
                <h2 className="text-4xl font-black uppercase funky-font drop-shadow-[2px_2px_0px_rgba(0,0,0,0.2)]">Login / Join</h2>
                <p className="font-bold text-slate-500 dark:text-slate-400">Choose your alias before entering the lobby.</p>
                
                <div className="w-full text-left">
                  <label className="font-bold mb-2 block">Your Name:</label>
                  <input 
                    type="text" 
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveNameAndEnter()}
                    className="w-full border-4 border-black dark:border-slate-600 p-3 rounded-xl font-bold bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-fuchsia-400 shadow-[inset_4px_4px_0px_0px_rgba(0,0,0,0.1)]"
                    placeholder="Enter a funky name..."
                    autoFocus
                  />
                </div>
                
                <NeoButton color="bg-lime-400 dark:bg-lime-600" className="w-full text-xl" onClick={saveNameAndEnter} disabled={!nameInput.trim()}>
                  <Play fill="currentColor" /> ENTER GAME
                </NeoButton>

                {profile.history && profile.history.length > 0 && (
                  <div className="w-full mt-4 border-t-2 border-black/10 dark:border-white/10 pt-4">
                    <span className="text-sm font-bold block mb-2 opacity-70">Play as previous:</span>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {Array.from(new Set(profile.history)).map((n, i) => (
                        <button 
                          key={i} onClick={() => selectPreviousName(n)}
                          className="text-xs bg-slate-200 dark:bg-slate-700 border-2 border-black dark:border-slate-500 rounded-full px-3 py-1 font-bold hover:bg-yellow-300 dark:hover:bg-yellow-600 transition-colors"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </NeoPanel>
            </div>
          ) : !room ? (
            <div className="flex flex-col gap-8 items-center mt-10">
              
              <div className="text-center w-full max-w-md">
                 <h2 className="text-xl font-bold opacity-70">Welcome back,</h2>
                 <p className="text-4xl font-black text-fuchsia-500 uppercase funky-font">{profile.name}</p>
                 <button onClick={() => setProfile({...profile, name: ''})} className="text-xs font-bold underline mt-2">Change Name</button>
              </div>

              <div className="flex flex-col md:flex-row gap-4 w-full max-w-md">
                <NeoButton color="bg-lime-400 dark:bg-lime-600" className="flex-1 text-xl" onClick={createRoom}>
                  <Play fill="currentColor" /> CREATE ROOM
                </NeoButton>
                <NeoPanel color="bg-cyan-200 dark:bg-cyan-800" className="flex-1 flex flex-col gap-2 !p-4">
                  <input 
                    type="text" 
                    value={roomId} 
                    onChange={e => setRoomId(e.target.value.toUpperCase())}
                    placeholder="ROOM CODE" 
                    className="w-full border-4 border-black dark:border-slate-600 p-2 rounded-xl font-black text-center text-xl uppercase tracking-widest bg-white dark:bg-slate-900"
                  />
                  <NeoButton color="bg-white dark:bg-slate-700" className="w-full" onClick={() => joinRoom()}>
                    JOIN
                  </NeoButton>
                </NeoPanel>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl mx-auto">
              
              <div className="flex-1 flex flex-col gap-6">
                
                <div className="bg-black dark:bg-slate-800 text-white p-3 rounded-2xl border-4 border-fuchsia-500 flex justify-between items-center shadow-[4px_4px_0px_0px_rgba(217,70,239,1)] dark:shadow-[4px_4px_0px_0px_rgba(217,70,239,0.4)]">
                  <div className="flex items-center gap-4">
                    <span className="font-black text-xl bg-fuchsia-500 text-black px-3 py-1 rounded-xl uppercase tracking-widest">
                      ROOM: {room.id}
                    </span>
                  </div>
                  <button onClick={leaveRoom} className="text-red-400 hover:text-red-300 font-bold flex items-center gap-1">
                    <Home size={18} /> LEAVE
                  </button>
                </div>

                {room.state === 'lobby' && (
                  <NeoPanel color="bg-yellow-200 dark:bg-yellow-900" className="flex flex-col gap-6 relative overflow-hidden">
                    <div className="absolute top-[-20px] right-[-20px] opacity-10 pointer-events-none">
                      <Settings size={200} className="animate-spin-slow" />
                    </div>
                    
                    <h2 className="text-3xl font-black uppercase flex items-center gap-2 relative z-10"><Users /> Lobby</h2>
                    
                    <div className="bg-white dark:bg-slate-800 border-4 border-black dark:border-slate-600 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 relative z-10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]">
                       <div className="flex flex-col flex-1 overflow-hidden w-full">
                          <span className="text-xs font-black uppercase flex items-center gap-1 opacity-60 mb-1"><Link size={12}/> Invite Friends</span>
                          <div className="font-mono text-sm break-all bg-slate-100 dark:bg-slate-900 p-2 rounded border-2 border-slate-300 dark:border-slate-700 select-all">
                            {`${window.location.origin}${window.location.pathname}?room=${room.id}`}
                          </div>
                       </div>
                       <NeoButton onClick={copyInviteLink} color="bg-fuchsia-400 dark:bg-fuchsia-600" className="!py-2 !text-sm w-full md:w-auto">
                         <Copy size={16} /> Copy
                       </NeoButton>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                      <div className="bg-white dark:bg-slate-800 border-4 border-black dark:border-slate-600 p-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]">
                        <h3 className="font-bold mb-2 uppercase border-b-2 border-black dark:border-slate-600 pb-1">Players ({Object.keys(room.players).length})</h3>
                        <ul className="space-y-2">
                          {Object.entries(room.players).map(([id, p]) => (
                            <li key={id} className="flex justify-between items-center font-bold">
                              <span>{p.name} {id === user!.uid && <span className="text-fuchsia-500 text-sm">(You)</span>}</span>
                              {id === room.hostId && <span className="text-xs bg-yellow-400 dark:bg-yellow-600 border-2 border-black dark:border-transparent px-2 py-0.5 rounded-full text-black">HOST</span>}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex flex-col gap-4">
                        <div className="bg-cyan-100 dark:bg-cyan-900 border-4 border-black dark:border-slate-600 p-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]">
                          <label className="font-bold mb-2 block uppercase">Word Category:</label>
                          <select 
                            disabled={user!.uid !== room.hostId}
                            value={room.category}
                            onChange={(e) => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', room.id), { category: e.target.value })}
                            className="w-full border-4 border-black dark:border-slate-500 rounded-lg p-2 font-bold bg-white dark:bg-slate-800 disabled:opacity-50"
                          >
                            {Object.keys(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {Object.keys(room.players).length >= 1 ? (
                      <SlideConfirm onConfirm={startGame} text="SWIPE TO START" color="bg-lime-400 dark:bg-lime-600" />
                    ) : (
                      <div className="text-center font-bold text-red-500">Need more players to start properly!</div>
                    )}
                  </NeoPanel>
                )}

                {room.state === 'playing' && (
                  <NeoPanel color={isImposterTheme ? "bg-red-900 border-red-500" : "bg-white dark:bg-slate-800"} className="flex flex-col gap-6 transition-colors duration-1000">
                    <div className="text-center flex flex-col items-center gap-4">
                      <h2 className={`text-2xl font-black uppercase ${isImposterTheme ? 'text-red-200' : ''}`}>Round {room.round} of {room.maxRounds}</h2>
                      
                      {!revealedRole ? (
                        <div className="w-full max-w-sm bg-slate-800 p-6 rounded-3xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all">
                          <h3 className="text-white font-black text-2xl mb-2 uppercase funky-font">Who are you?</h3>
                          <p className="text-fuchsia-300 font-bold text-sm animate-pulse">Follow the cards...</p>
                          <MonteCards onSelectCard={() => {
                             setCardPicked(true);
                             setRevealedRole(true);
                          }} />
                        </div>
                      ) : (
                        <div className={`p-8 rounded-3xl border-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md animate-float ${
                          isImposterTheme ? 'bg-red-950 border-red-600 shadow-red-950/50' : 'bg-cyan-100 dark:bg-cyan-900 border-black dark:border-slate-700 dark:shadow-[8px_8px_0px_0px_rgba(0,0,0,0.5)]'
                        }`}>
                          <h3 className={`text-xl font-black uppercase mb-2 ${isImposterTheme ? 'text-red-400' : 'text-slate-500 dark:text-slate-300'}`}>Your Role is</h3>
                          <div className={`text-6xl font-black funky-font tracking-tighter uppercase mb-6 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)] ${
                            isImposterTheme ? 'text-red-500' : 'text-blue-500 dark:text-blue-300'
                          }`}>
                            {room.players[user!.uid]?.role}
                          </div>
                          
                          <div className="bg-black p-4 rounded-xl border-4 border-white text-left">
                            <p className="text-white font-bold text-sm mb-1 uppercase text-center">Secret Word</p>
                            <p className={`text-3xl font-black text-center ${isImposterTheme ? 'text-red-500 filter blur-sm hover:blur-none transition-all' : 'text-lime-400'}`}>
                              {isImposterTheme ? '???' : room.word}
                            </p>
                            {isImposterTheme && <p className="text-xs text-red-300 text-center mt-2 italic">Blend in. Pretend you know it.</p>}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-200 dark:bg-slate-700 border-4 border-black dark:border-slate-600 rounded-2xl p-4 shadow-[inset_4px_4px_0px_rgba(0,0,0,0.1)]">
                      <h3 className="font-bold text-lg mb-4 uppercase text-black dark:text-white">Turn Order</h3>
                      <div className="flex flex-wrap gap-2">
                        {room.turnOrder.map((pId, idx) => {
                          const isCurrent = idx === room.currentTurnIndex;
                          const pName = room.players[pId]?.name;
                          const passes = room.players[pId]?.passedTurn?.length || 0;
                          
                          return (
                            <div key={pId} className={`
                              flex items-center gap-2 px-4 py-2 rounded-xl border-4 font-bold transition-all
                              ${isCurrent ? 'bg-yellow-400 dark:bg-yellow-500 border-black animate-blink scale-110 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] text-black' : 'bg-white dark:bg-slate-800 border-slate-400 dark:border-slate-600 text-slate-500 dark:text-slate-400 scale-90 opacity-70'}
                            `}>
                              {isCurrent && <span className="text-xl">👉</span>}
                              <span>{pName} {pId === user!.uid && '(You)'}</span>
                              {passes > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">Skipped: {passes}/2</span>}
                              
                              {isCurrent && pId !== user!.uid && (
                                <button 
                                  onClick={() => passTurn(pId)}
                                  className="ml-2 bg-red-400 hover:bg-red-500 text-black text-xs border-2 border-black rounded px-2 py-1"
                                >
                                  PASS TURN
                                </button>
                              )}
                              {isCurrent && pId === user!.uid && (
                                <button 
                                  onClick={() => nextTurn()}
                                  className="ml-2 bg-lime-400 hover:bg-lime-500 text-black text-xs border-2 border-black rounded px-2 py-1"
                                >
                                  DONE
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </NeoPanel>
                )}

                {room.state === 'voting' && (
                  <NeoPanel color="bg-purple-200 dark:bg-purple-900" className="flex flex-col gap-6 items-center">
                     <h2 className="text-4xl font-black uppercase text-center funky-font drop-shadow-[2px_2px_0px_rgba(0,0,0,1)] text-white bg-black px-6 py-2 rounded-xl border-4 border-fuchsia-500 animate-pulse">
                       Voting Time!
                     </h2>

                     <div className="flex flex-col items-center bg-white/50 dark:bg-black/50 p-4 rounded-xl border-4 border-black dark:border-slate-700 w-full">
                        <span className="font-bold text-sm mb-2 uppercase opacity-80">Waiting for Votes From:</span>
                        <div className="flex flex-wrap justify-center gap-2">
                           {Object.keys(room.players).filter(id => !room.votes[id]).map(id => (
                              <span key={id} className="bg-red-500 text-white font-bold px-3 py-1 rounded-full text-xs shadow-[2px_2px_0px_rgba(0,0,0,1)] animate-pulse">
                                 {room.players[id].name}
                              </span>
                           ))}
                           {Object.keys(room.players).filter(id => !room.votes[id]).length === 0 && (
                              <span className="text-lime-500 font-black uppercase">Everyone has voted! Tallying...</span>
                           )}
                        </div>
                     </div>

                     <p className="font-bold text-xl text-center mt-2">Who is the Imposter?</p>
                     
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
                       {Object.entries(room.players).map(([id, p]) => {
                         const hasVotedMe = room.votes[user!.uid] === id;
                         const votersForThisPerson = Object.keys(room.votes).filter(vId => room.votes[vId] === id);
                         const voteCount = votersForThisPerson.length;
                         
                         return (
                           <button
                             key={id}
                             onClick={() => castVote(id)}
                             className={`
                               flex flex-col items-center justify-center p-4 border-4 border-black dark:border-slate-700 rounded-xl font-black text-lg transition-all
                               ${hasVotedMe ? 'bg-lime-400 dark:bg-lime-600 shadow-[inset_4px_4px_0px_rgba(0,0,0,0.2)] translate-y-1' : 'bg-white dark:bg-slate-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:-translate-y-1'}
                             `}
                           >
                             <div className="text-xl mb-2">{p.name}</div>
                             <div className="text-xs bg-black text-white rounded-full px-2 py-1 inline-block mb-2">Votes: {voteCount}</div>
                             {voteCount > 0 && (
                                <div className="text-[10px] bg-white/50 dark:bg-black/50 px-2 py-1 rounded w-full overflow-hidden text-ellipsis whitespace-nowrap text-slate-800 dark:text-slate-300">
                                   {votersForThisPerson.map(vId => room.players[vId]?.name).join(', ')}
                                </div>
                             )}
                           </button>
                         );
                       })}
                     </div>
                  </NeoPanel>
                )}

                {room.state === 'result' && (
                  <NeoPanel color="bg-orange-200 dark:bg-orange-900" className="flex flex-col gap-6 items-center text-center">
                    <Skull size={64} className="animate-bounce mb-2" />
                    <h2 className="text-5xl font-black uppercase funky-font drop-shadow-[3px_3px_0px_rgba(0,0,0,1)] text-white">
                      RESULTS
                    </h2>
                    
                    <div className="bg-white dark:bg-slate-800 border-4 border-black dark:border-slate-700 p-6 rounded-3xl w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(0,0,0,0.5)]">
                      <p className="text-2xl font-black mb-4">The Imposter was...</p>
                      <p className="text-4xl font-black text-red-600 dark:text-red-400 uppercase mb-6 animate-pulse">
                        {room.players[room.imposterId]?.name}!
                      </p>
                      <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-xl border-4 border-black dark:border-slate-700 text-left">
                         <p className="font-bold text-lg mb-2 border-b-2 border-black dark:border-slate-600 pb-1">Scores:</p>
                         {Object.entries(room.players).sort((a,b)=> b[1].score - a[1].score).map(([id, p]) => (
                           <div key={id} className="flex justify-between font-bold py-1">
                             <span>{p.name}</span>
                             <span className="text-fuchsia-600 dark:text-fuchsia-400">{p.score} pts</span>
                           </div>
                         ))}
                      </div>

                      <div className="mt-6 bg-purple-100 dark:bg-purple-950 p-4 rounded-xl border-4 border-black dark:border-purple-800 text-left shadow-[inset_4px_4px_0px_rgba(0,0,0,0.1)]">
                          <div className="flex justify-between items-center mb-2">
                             <h4 className="font-black uppercase text-purple-700 dark:text-purple-300">✨ AI Match Recap</h4>
                             <button 
                                 onClick={generateAiRoast}
                                 disabled={isGeneratingRoast}
                                 className="bg-purple-300 dark:bg-purple-700 hover:bg-purple-400 border-2 border-black dark:border-purple-500 rounded-lg px-3 py-1 text-xs font-bold shadow-[2px_2px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_rgba(0,0,0,0.5)] disabled:opacity-50 active:scale-95 transition-all text-black dark:text-white"
                             >
                                 {isGeneratingRoast ? 'Thinking...' : '✨ Roast Us'}
                             </button>
                          </div>
                          <p className="font-bold text-sm text-slate-700 dark:text-slate-300 italic">
                              {aiRoast || "Click the button to let the AI analyze the chat and roast your gameplay!"}
                          </p>
                      </div>
                    </div>

                    {user!.uid === room.hostId && (
                      <NeoButton color="bg-lime-400 dark:bg-lime-600" className="text-2xl mt-4 w-full max-w-md" onClick={resetGame}>
                        PLAY AGAIN SAME ROOM
                      </NeoButton>
                    )}
                    {user!.uid !== room.hostId && (
                      <p className="font-bold animate-pulse mt-4 text-orange-900 dark:text-orange-200">Waiting for host to restart...</p>
                    )}
                  </NeoPanel>
                )}

              </div>

              <div className="w-full lg:w-80 flex flex-col gap-6">
                
                <NeoPanel color="bg-white dark:bg-slate-800" className="flex-1 min-h-[450px] max-h-[600px] flex flex-col p-4 !pb-2">
                  <h3 className="font-black uppercase flex items-center gap-2 border-b-4 border-black dark:border-slate-600 pb-2 mb-2">
                    <MessageSquare /> Secret DM Chat
                  </h3>
                  
                  <div className="flex overflow-x-auto gap-2 mb-2 pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                     {Object.keys(room.players).filter(id => id !== user!.uid).map(pId => (
                        <button 
                           key={pId}
                           onClick={() => setSelectedChatUser(pId)}
                           className={`whitespace-nowrap px-3 py-1 border-2 border-black dark:border-slate-600 rounded-full text-xs font-bold transition-all ${selectedChatUser === pId ? 'bg-lime-400 dark:bg-lime-600 text-black shadow-[2px_2px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_rgba(0,0,0,0.5)] scale-105' : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200'}`}
                        >
                           {room.players[pId].name}
                        </button>
                     ))}
                     {Object.keys(room.players).length <= 1 && (
                        <span className="text-xs font-bold text-slate-400 italic">Waiting for others to join...</span>
                     )}
                  </div>

                  <div className="flex-1 overflow-y-auto flex flex-col gap-3 mb-4 pr-2 bg-slate-50 dark:bg-slate-900 rounded-xl p-3 border-2 border-slate-200 dark:border-slate-700 shadow-inner">
                    {room.chats?.filter(c => 
                        c.sender === 'System' || 
                        (c.senderId === user!.uid && c.recipientId === selectedChatUser) ||
                        (c.senderId === selectedChatUser && c.recipientId === user!.uid)
                    ).map((c, i) => {
                      const isSystem = c.sender === 'System';
                      const isMe = c.senderId === user!.uid;
                      
                      return (
                        <div key={i} className={`flex flex-col ${isSystem ? 'items-center' : isMe ? 'items-end' : 'items-start'} w-full`}>
                          {!isSystem && <span className="text-[10px] opacity-60 mb-0.5 px-1">{isMe ? 'You' : c.sender}</span>}
                          <div className={`p-2.5 rounded-2xl border-2 border-black text-sm font-bold w-max max-w-[85%] break-words
                            ${isSystem ? 'bg-yellow-200 text-black rounded-lg text-center shadow-[2px_2px_0px_rgba(0,0,0,1)]' : 
                              isMe ? 'bg-lime-300 text-black rounded-tr-sm shadow-[2px_2px_0px_rgba(0,0,0,1)]' : 
                              'bg-purple-300 text-black rounded-tl-sm shadow-[2px_2px_0px_rgba(0,0,0,1)]'}
                          `}>
                            {c.msg}
                          </div>
                        </div>
                      )
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={sendChat} className="flex gap-2">
                    <input 
                      type="text" 
                      value={chatMsg} 
                      onChange={e => setChatMsg(e.target.value)}
                      disabled={!selectedChatUser}
                      className="flex-1 border-4 border-black dark:border-slate-600 rounded-xl px-3 py-2 font-bold bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 disabled:opacity-50 text-black dark:text-white"
                      placeholder={selectedChatUser ? "Whisper a secret..." : "Select player..."}
                    />
                    <NeoButton color="bg-cyan-400 dark:bg-cyan-600" disabled={!selectedChatUser} className="!px-4 !py-2"><Send size={18}/></NeoButton>
                  </form>
                </NeoPanel>

                <NeoPanel color="bg-slate-200 dark:bg-slate-800" className="max-h-[300px] overflow-y-auto p-4">
                  <h3 className="font-black uppercase flex items-center gap-2 border-b-4 border-black dark:border-slate-600 pb-2 mb-4">
                    <History /> History
                  </h3>
                  {room.historyLog?.length === 0 ? (
                    <p className="text-sm font-bold opacity-50 text-center py-4">No games played yet.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {room.historyLog?.slice().reverse().map((h, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 border-2 border-black dark:border-slate-700 p-3 rounded-lg text-xs font-bold shadow-[2px_2px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_rgba(0,0,0,0.5)]">
                          <div className="text-red-500 dark:text-red-400 mb-1 text-sm">{h.result}</div>
                          <div className="flex justify-between text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                            <span>Word: {h.word}</span>
                            <span>{formatTime(h.duration)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </NeoPanel>

              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
