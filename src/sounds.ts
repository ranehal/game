// Funky / Meme sound effects mapping
// For a real prototype we'd load mp3s, but Web Audio API oscillators are perfect for zero-dependency generated sounds.

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

export function playSound(type: 'click' | 'swipe' | 'pop' | 'error' | 'dramatic' | 'vineBoom' | 'win' | 'lose') {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  switch (type) {
    case 'click':
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, now);
      oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.1);
      gainNode.gain.setValueAtTime(0.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      break;
    case 'swipe':
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(100, now);
      oscillator.frequency.linearRampToValueAtTime(800, now + 0.3);
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
      oscillator.start(now);
      oscillator.stop(now + 0.3);
      break;
    case 'vineBoom':
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(150, now);
      oscillator.frequency.exponentialRampToValueAtTime(20, now + 0.8);
      gainNode.gain.setValueAtTime(1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
      
      // Add a bit of distortion
      const distortion = audioCtx.createWaveShaper();
      function makeDistortionCurve(amount = 50) {
        let k = typeof amount === 'number' ? amount : 50,
            n_samples = 44100,
            curve = new Float32Array(n_samples),
            deg = Math.PI / 180,
            i = 0,
            x;
        for ( ; i < n_samples; ++i ) {
          x = i * 2 / n_samples - 1;
          curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
        }
        return curve;
      };
      distortion.curve = makeDistortionCurve(400);
      distortion.oversample = '4x';
      
      oscillator.disconnect();
      oscillator.connect(distortion);
      distortion.connect(gainNode);
      
      oscillator.start(now);
      oscillator.stop(now + 0.8);
      break;
    case 'dramatic':
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(55, now);
      oscillator.frequency.setValueAtTime(45, now + 0.2);
      gainNode.gain.setValueAtTime(0.5, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 1.5);
      oscillator.start(now);
      oscillator.stop(now + 1.5);
      break;
    case 'pop':
    default:
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, now);
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
      break;
  }
}
