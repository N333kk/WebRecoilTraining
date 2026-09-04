const fs = require('fs');

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function generatePattern(keyframes, totalShots) {
  const pattern = [];
  for (let i = 0; i < totalShots; i++) {
    const t = i / (totalShots - 1); // 0 to 1
    
    // Find segment
    let kf1 = keyframes[0];
    let kf2 = keyframes[keyframes.length - 1];
    
    for (let j = 0; j < keyframes.length - 1; j++) {
      if (t >= keyframes[j].t && t <= keyframes[j+1].t) {
        kf1 = keyframes[j];
        kf2 = keyframes[j+1];
        break;
      }
    }
    
    const segmentT = (t - kf1.t) / (kf2.t - kf1.t || 1);
    
    // Ease out slightly for recoil feel
    const easeT = Math.sin(segmentT * Math.PI / 2);
    
    let x = lerp(kf1.x, kf2.x, segmentT);
    let y = lerp(kf1.y, kf2.y, easeT);
    
    // Add tiny noise
    x += (Math.random() - 0.5) * 0.15;
    y += (Math.random() - 0.5) * 0.15;
    
    // Ensure first bullet is exactly 0,0
    if (i === 0) {
      x = 0; y = 0;
    }
    
    pattern.push({ x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)) });
  }
  return pattern;
}

const db = JSON.parse(fs.readFileSync('src/weapons.json', 'utf8'));

// M4A4 (30 rounds)
db.m4a4.pattern = generatePattern([
  { t: 0.0, x: 0.0, y: 0.0 },
  { t: 0.25, x: 0.2, y: 7.5 }, // bullet 8
  { t: 0.45, x: 3.5, y: 8.5 }, // bullet 14
  { t: 0.8, x: -3.8, y: 9.2 }, // bullet 24
  { t: 1.0, x: 1.5, y: 9.4 }   // bullet 30
], 30);
db.m4a4.recoilMaxVerticalDeg = 9.4;
db.m4a4.recoilMaxHorizontalDeg = 3.8;

// FAMAS (25 rounds)
db.famas.pattern = generatePattern([
  { t: 0.0, x: 0.0, y: 0.0 },
  { t: 0.35, x: 1.5, y: 7.0 }, // bullet 9
  { t: 0.6, x: -2.5, y: 7.5 }, // bullet 15
  { t: 1.0, x: 2.0, y: 8.0 }   // bullet 25
], 25);
db.famas.recoilMaxVerticalDeg = 8.0;
db.famas.recoilMaxHorizontalDeg = 2.5;

// Galil (35 rounds)
db.galil.pattern = generatePattern([
  { t: 0.0, x: 0.0, y: 0.0 },
  { t: 0.25, x: -2.0, y: 7.5 }, // bullet 9
  { t: 0.4, x: 2.5, y: 8.5 }, // bullet 14
  { t: 0.6, x: -3.0, y: 9.0 }, // bullet 21
  { t: 1.0, x: 3.5, y: 9.5 }   // bullet 35
], 35);
db.galil.recoilMaxVerticalDeg = 9.5;
db.galil.recoilMaxHorizontalDeg = 3.5;

// MAC-10 (30 rounds)
db.mac10.pattern = generatePattern([
  { t: 0.0, x: 0.0, y: 0.0 },
  { t: 0.3, x: -1.0, y: 11.0 }, // bullet 9
  { t: 0.65, x: 4.5, y: 13.5 }, // bullet 20
  { t: 1.0, x: -4.0, y: 14.5 }  // bullet 30
], 30);
db.mac10.recoilMaxVerticalDeg = 14.5;
db.mac10.recoilMaxHorizontalDeg = 4.5;

fs.writeFileSync('src/weapons.json', JSON.stringify(db, null, 2));
console.log('Weapons updated.');
