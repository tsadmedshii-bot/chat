// Постын зураг — профайл зургаас ялгаатай нь дөрвөлжин таслахгүй,
// харьцааг нь хадгалж, их талыг нь 1200px болгон жижигрүүлнэ.
// 1200px JPEG (чанар 0.82) нь 1 MB хязгаарт багтана.
export function resizePostImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Зураг уншиж чадсангүй'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Зураг нээж чадсангүй'));
      img.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Зураг боловсруулж чадсангүй'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
