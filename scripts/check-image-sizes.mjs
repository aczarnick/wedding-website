import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { imageSizeFromFile } from 'image-size/fromFile';

const IMAGES_DIR = 'public/images';
const MAX_WIDTH_PX = 2600;
const MAX_HEIGHT_PX = 2600;
const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024;

const toMiB = (bytes) => (bytes / 1024 / 1024).toFixed(2);

async function checkImage(filePath) {
  const violations = [];
  const { size } = statSync(filePath);
  const { width, height } = await imageSizeFromFile(filePath);

  if (width > MAX_WIDTH_PX || height > MAX_HEIGHT_PX) {
    violations.push(
      `${filePath}: ${width}x${height}px exceeds ${MAX_WIDTH_PX}x${MAX_HEIGHT_PX}px`
    );
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    violations.push(
      `${filePath}: ${toMiB(size)} MiB exceeds ${toMiB(MAX_FILE_SIZE_BYTES)} MiB`
    );
  }
  return violations;
}

const files = readdirSync(IMAGES_DIR).map((name) => join(IMAGES_DIR, name));
const results = await Promise.all(files.map(checkImage));
const violations = results.flat();

if (violations.length > 0) {
  console.error('Image size check failed:');
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log(`Image size check passed (${files.length} file(s) checked).`);
