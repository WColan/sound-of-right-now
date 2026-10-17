/**
 * Chord name + progression timeline overlay (DOM). Shared by the WebGL and
 * Canvas visualizers' hosts.
 */
const QUALITY_NAMES = { maj7: 'maj7', min7: 'm7', dom7: '7', min7b5: 'm7b5' };
const QUALITY_COLORS = {
  maj7: 'rgba(255, 210, 100, 0.9)',
  min7: 'rgba(140, 180, 255, 0.9)',
  dom7: 'rgba(255, 155, 80, 0.9)',
  min7b5: 'rgba(160, 130, 200, 0.9)',
};

export function formatChordName(chordInfo) {
  return `${chordInfo.rootName}${QUALITY_NAMES[chordInfo.quality] ?? chordInfo.quality}`;
}

export function createChordDisplay(nameEl = document.getElementById('chord-name'), timelineEl = document.getElementById('chord-timeline')) {
  let fadeTimer = null;
  let qualities = [];

  function applyDots(index) {
    [...timelineEl.children].forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
      dot.classList.toggle('past', i < index);
    });
  }

  return {
    update(chordInfo) {
      if (!nameEl || !timelineEl) return;
      if (chordInfo.allQualities?.length) qualities = chordInfo.allQualities;
      nameEl.classList.remove('fade-in');
      nameEl.classList.add('fade-out');
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        nameEl.textContent = formatChordName(chordInfo);
        nameEl.style.color = QUALITY_COLORS[chordInfo.quality] ?? 'rgba(255, 255, 255, 0.9)';
        nameEl.classList.remove('fade-out');
        nameEl.classList.add('fade-in');
      }, 200);
      if (timelineEl.children.length !== chordInfo.total) {
        timelineEl.innerHTML = '';
        for (let i = 0; i < chordInfo.total; i++) {
          const dot = document.createElement('div');
          dot.className = 'dot';
          if (qualities[i]) dot.setAttribute('data-quality', qualities[i]);
          timelineEl.appendChild(dot);
        }
      }
      applyDots(chordInfo.index);
    },
    dispose() {
      clearTimeout(fadeTimer);
    },
  };
}
