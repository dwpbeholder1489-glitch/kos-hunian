let audio;

export function prepareScanSound() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ||= new Audio();
    if (audio.state !== 'running') audio.resume().catch(() => {});
  } catch {
    // Audio availability never changes whether the scan succeeded.
  }
}

export function playScanSuccess() {
  try {
    if (!audio || audio.state !== 'running') return;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    tone.frequency.value = 1460;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    tone.connect(gain);
    gain.connect(audio.destination);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    tone.start(now);
    tone.stop(now + 0.12);
  } catch {
    // Audio can be interrupted by the device while the product is accepted.
  }
}
