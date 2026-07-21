const fs = require('fs');
const code = fs.readFileSync('src/AdminPanel.tsx', 'utf-8');
const lines = code.split('\n');

const getCroppedImgFunc = `const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<string> => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  const TARGET_SIZE = 400;
  const scale = Math.min(TARGET_SIZE / pixelCrop.width, TARGET_SIZE / pixelCrop.height, 1);
  const width = pixelCrop.width * scale;
  const height = pixelCrop.height * scale;

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    width,
    height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Canvas is empty');
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/jpeg', 0.9);
  });
};`;

lines.splice(6, 0, ...getCroppedImgFunc.split('\n'));
fs.writeFileSync('src/AdminPanel.tsx', lines.join('\n'));
