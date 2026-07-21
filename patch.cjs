const fs = require('fs');
const code = fs.readFileSync('src/App.tsx', 'utf-8');
const lines = code.split('\n');

const defaultPollData = `const DEFAULT_POLL_DATA: PollData = {
  questions: [
    {
      id: "q1",`;

lines.splice(16, 0, ...defaultPollData.split('\n'));
fs.writeFileSync('src/App.tsx', lines.join('\n'));
