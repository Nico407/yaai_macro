/** A photo from the camera or gallery as a JPEG data URL, at most `max` px on its longer side. Phones' photos are
 *  several MB; this makes them about 60-120 kB, small enough to keep in the database. Turned upright from EXIF. */
export async function photoToJpeg(file: File, max = 800, quality = 0.78): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a photo");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
    .catch(() => loadViaImg(file));
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read the photo");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadViaImg(file: File): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); ok(img); };
    img.onerror = () => fail(new Error("Couldn't read the photo (HEIC? try a JPEG)"));
    img.src = URL.createObjectURL(file);
  });
}
