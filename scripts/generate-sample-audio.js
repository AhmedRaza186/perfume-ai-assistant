const fs = require('fs');
const path = require('path');

function createWavBuffer(durationSeconds, frequency = 440, sampleRate = 44100) {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // 'fmt ' chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // audio format (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample

  // 'data' chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write samples with a smooth acoustic chime/envelope
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Pleasant layered harmonic sound with exponential decay
    const envelope = Math.exp(-1.5 * (t % 1.2));
    const tone = Math.sin(2 * Math.PI * frequency * t) * 0.6 +
                 Math.sin(2 * Math.PI * frequency * 1.5 * t) * 0.25 +
                 Math.sin(2 * Math.PI * frequency * 2 * t) * 0.15;
    const sample = Math.max(-1, Math.min(1, tone * envelope * 0.4));
    const intSample = Math.floor(sample * 32767);
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }

  return buffer;
}

const audioDir = path.join(__dirname, '../public/audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// 4-second assistant voice sample
const assistantAudio = createWavBuffer(4.2, 523.25); // C5 chime note
fs.writeFileSync(path.join(audioDir, 'assistant-sample.wav'), assistantAudio);

console.log('Sample audio files generated successfully at', audioDir);
