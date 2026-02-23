# Imposter Keda - Project Context

## Overview
A complex P2P WebRTC-based multiplayer game (Imposter/Spyfall style) built for GitHub pages. 
This file acts as a memory context for future sessions.

## Tech Stack
- Frontend: React + TypeScript + Vite
- Styling: Vanilla CSS (Custom Keyframe animations, Blurs, Playful UI)
- Animations/UI: Framer Motion, Lucide Icons
- Networking: PeerJS (WebRTC P2P mesh network)

## Game Flow & Rules
1. **Lobby:** Players sign in with previous names, create or join rooms (via invite link), share links. P2P chat starts here.
2. **Setup:** Room host configures Word category, number of rounds, timers. 
3. **Role Distribution:** "Illusion of choice" card shuffle animation. One player is randomly the "Imposter". Everyone else is a "Townie" and gets the secret word. The Imposter gets "???". Swipe to reveal role.
4. **Gameplay:** Turn-based indicator. 
   - A player gives a hint without giving away the word.
   - Other players tap "pass" for that player. 
   - Once at least 2 players pass, turn moves to the next.
5. **Voting:** Real-time votes. Score calculations per correct vote. Timeout warnings. Dramatic score reveal.
6. **End Game:** Detailed log of who was Imposter, playtime, scores, all-time stats. Shareable stats to socials. Play again in the same room.

## Hidden Features
- **God Mode:** A hidden floating window with all player data (roles, word, chats) accessible by tapping a specific "Hint/FAQ" button 5 times.
- **Persistence:** Players can refresh the browser and auto-resume via `localStorage`.

## Development Timeline
- **Jul 2025:** Initial Setup.
- **Late Jul 2025:** Basic UI built.
- **Aug 2025:** Game logic, roles, P2P networking implemented.
- **Late Aug 2025:** Polishing, God Mode, Meme aesthetics.
- **Current:** Finalizing features and fixing bugs.

## Note for Maintainer
The game uses a Mesh network topology. Each peer connects to every other peer in the room. The host handles the authoritative state and broadcasts to all peers.
