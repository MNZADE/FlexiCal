import type { AudioPlayer } from 'expo-audio';

let activePlayer: AudioPlayer | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

export async function playTaskAlertTone(uri: string) {
  if (stopTimer) clearTimeout(stopTimer);
  activePlayer?.remove();

  const { createAudioPlayer } = await import('expo-audio');
  const player = createAudioPlayer(uri);
  activePlayer = player;
  player.volume = 0.8;
  player.play();

  stopTimer = setTimeout(() => {
    if (activePlayer !== player) return;
    player.remove();
    activePlayer = null;
    stopTimer = null;
  }, 10_000);
}
