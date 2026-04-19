const { execFile } = require('child_process');
const { speechRate } = require('../config');

function speakText(text) {
  return new Promise((resolve, reject) => {
    const safeText = String(text || '').replace(/'/g, "''");
    const rate = Math.max(-10, Math.min(10, Math.round((Number(speechRate) - 1) * 10)));
    const script = [
      'Add-Type -AssemblyName System.Speech;',
      '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
      `$synth.Rate = ${rate};`,
      `$synth.Speak('${safeText}');`
    ].join(' ');

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

module.exports = {
  speakText
};