const fs = require('fs');
const code = fs.readFileSync('src/App.tsx', 'utf-8');

const lines = code.split('\n');
const newFetchUserIpHash = `const fetchUserIpHash = async (): Promise<string> => {
  const providers = [
    'https://api.ipify.org?format=json',
    'https://api64.ipify.org?format=json',
    'https://api.seeip.org/jsonip',
  ];

  try {
    const fetchPromises = providers.map(async (url) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      const ip = data.ip || data.query;
      if (!ip) throw new Error('No IP found');
      return ip;
    });

    const ip = await Promise.any(fetchPromises);
    
    const encoder = new TextEncoder();
    const ipData = encoder.encode(ip + "_salt_pbook");
    const hashBuffer = await crypto.subtle.digest('SHA-256', ipData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
  } catch (error) {
    console.warn("Failed to fetch IP securely, using fallback", error);
    return getFallbackIpHash();
  }
};`;

lines.splice(49, 29, ...newFetchUserIpHash.split('\n'));
fs.writeFileSync('src/App.tsx', lines.join('\n'));
