const fs = require('fs');
const code = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = code.split('\n');

for (let i = 490; i < 550; i++) {
  if (lines[i] && lines[i].includes('/>') && lines[i].includes('            />')) {
    lines[i] = lines[i].replace('/>', '/></Suspense>');
    break;
  }
}

fs.writeFileSync('src/App.tsx', lines.join('\n'));
