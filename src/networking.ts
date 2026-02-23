import Peer, { type DataConnection } from 'peerjs';

export type GameState = 'LOBBY' | 'ROLES' | 'PLAYING' | 'VOTING' | 'RESULTS';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
  passedCount: number; // votes to pass turn
  votedFor?: string; // id of player they voted for
}

export interface RoomState {
  roomId: string;
  state: GameState;
  players: Player[];
  messages: { sender: string; text: string; time: number }[];
  imposterId: string | null;
  secretWord: string;
  currentTurnId: string | null;
  round: number;
  maxRounds: number;
  startTime: number;
}

export type NetworkMessage = 
  | { type: 'STATE_SYNC'; state: RoomState }
  | { type: 'CHAT'; text: string; senderId: string }
  | { type: 'ACTION'; action: string; payload: any; senderId: string };

type StateCallback = (state: RoomState) => void;

export class GameManager {
  peer: Peer | null = null;
  connections: Map<string, DataConnection> = new Map();
  state: RoomState;
  isHost: boolean = false;
  myId: string = '';
  myName: string = '';
  
  onStateUpdate: StateCallback | null = null;

  constructor() {
    this.state = this.getInitialState();
  }

  getInitialState(): RoomState {
    return {
      roomId: '',
      state: 'LOBBY',
      players: [],
      messages: [],
      imposterId: null,
      secretWord: '',
      currentTurnId: null,
      round: 1,
      maxRounds: 3,
      startTime: Date.now()
    };
  }

  initialize(name: string, roomId?: string) {
    this.myName = name;
    this.isHost = !roomId;
    
    // We create an ID. If host, id is new random. If joining, ID is new random.
    const id = Math.random().toString(36).substring(2, 9);
    this.myId = id;
    
    // PeerJS uses the roomId as the host's peer ID
    const peerId = this.isHost ? (roomId || id) : id;
    this.state.roomId = this.isHost ? peerId : roomId!;

    this.peer = new Peer(peerId, { debug: 2 });
    
    this.peer.on('open', (id) => {
      console.log('My peer ID is: ' + id);
      if (this.isHost) {
        this.state.players.push({ id: this.myId, name: this.myName, isHost: true, score: 0, passedCount: 0 });
        this.notifyUpdate();
      } else {
        // Join the host
        this.connectToPeer(this.state.roomId);
      }
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });
  }

  connectToPeer(peerId: string) {
    if (!this.peer) return;
    const conn = this.peer.connect(peerId);
    conn.on('open', () => {
      this.setupConnection(conn);
      // Ask to join
      conn.send({ type: 'ACTION', action: 'JOIN', payload: { name: this.myName }, senderId: this.myId });
    });
  }

  setupConnection(conn: DataConnection) {
    this.connections.set(conn.peer, conn);
    conn.on('data', (data: any) => {
      this.handleMessage(data as NetworkMessage);
    });
    conn.on('close', () => {
      this.connections.delete(conn.peer);
      if (this.isHost) {
        this.state.players = this.state.players.filter(p => p.id !== conn.peer);
        this.broadcastState();
      }
    });
  }

  handleMessage(msg: NetworkMessage) {
    if (msg.type === 'STATE_SYNC') {
      this.state = msg.state;
      this.notifyUpdate();
    } else if (this.isHost && msg.type === 'ACTION') {
      // Host handles actions and updates state
      if (msg.action === 'JOIN') {
        if (!this.state.players.find(p => p.id === msg.senderId)) {
          this.state.players.push({ id: msg.senderId, name: msg.payload.name, isHost: false, score: 0, passedCount: 0 });
          this.broadcastState();
        }
      } else if (msg.action === 'CHAT') {
        this.state.messages.push({ sender: msg.payload.name, text: msg.payload.text, time: Date.now() });
        this.broadcastState();
      } else if (msg.action === 'START_GAME') {
        this.startGame(msg.payload.word);
      } else if (msg.action === 'PASS_TURN') {
        const p = this.state.players.find(p => p.id === this.state.currentTurnId);
        if (p) {
          p.passedCount++;
          if (p.passedCount >= 2) {
            this.nextTurn();
          }
          this.broadcastState();
        }
      } else if (msg.action === 'VOTE') {
        const voter = this.state.players.find(p => p.id === msg.senderId);
        if (voter) voter.votedFor = msg.payload.targetId;
        
        // check if everyone voted
        if (this.state.players.every(p => p.votedFor)) {
          this.calculateScores();
          this.state.state = 'RESULTS';
        }
        this.broadcastState();
      }
    }
  }

  broadcastState() {
    if (!this.isHost) return;
    const msg: NetworkMessage = { type: 'STATE_SYNC', state: this.state };
    this.connections.forEach(conn => conn.send(msg));
    this.notifyUpdate();
  }

  sendAction(action: string, payload: any = {}) {
    if (this.isHost) {
      this.handleMessage({ type: 'ACTION', action, payload, senderId: this.myId });
    } else {
      const hostConn = this.connections.get(this.state.roomId);
      if (hostConn) {
        hostConn.send({ type: 'ACTION', action, payload, senderId: this.myId });
      }
    }
  }

  sendChat(text: string) {
    this.sendAction('CHAT', { text, name: this.myName });
  }

  startGame(word: string) {
    if (!this.isHost) return;
    this.state.secretWord = word;
    this.state.state = 'ROLES';
    // Random imposter
    const imposterIndex = Math.floor(Math.random() * this.state.players.length);
    this.state.imposterId = this.state.players[imposterIndex].id;
    this.state.currentTurnId = this.state.players[0].id;
    this.state.startTime = Date.now();
    this.state.players.forEach(p => { p.passedCount = 0; p.votedFor = undefined; });
    this.broadcastState();
  }

  nextTurn() {
    const idx = this.state.players.findIndex(p => p.id === this.state.currentTurnId);
    this.state.players.forEach(p => p.passedCount = 0); // reset passes
    
    if (idx >= this.state.players.length - 1) {
      // round over
      if (this.state.round >= this.state.maxRounds) {
        this.state.state = 'VOTING';
      } else {
        this.state.round++;
        this.state.currentTurnId = this.state.players[0].id;
      }
    } else {
      this.state.currentTurnId = this.state.players[idx + 1].id;
    }
  }

  calculateScores() {
    this.state.players.forEach(p => {
      if (p.id !== this.state.imposterId && p.votedFor === this.state.imposterId) {
        p.score += 10;
      }
      if (p.id === this.state.imposterId && p.votedFor) { // Imposter points?
        p.score += 5;
      }
    });
  }

  notifyUpdate() {
    if (this.onStateUpdate) {
      this.onStateUpdate({ ...this.state });
    }
  }

  disconnect() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}

export const gameManager = new GameManager();
