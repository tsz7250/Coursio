const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const newName = process.argv[3];

if (!dir || !newName) {
  console.error('Usage: node rename-artifact.js <dir> <newName>');
  process.exit(1);
}

const absoluteDir = path.resolve(dir);
if (!fs.existsSync(absoluteDir)) {
  console.error(`Directory ${absoluteDir} does not exist`);
  process.exit(1);
}

const files = fs.readdirSync(absoluteDir);
const zipFiles = files.filter(f => f.endsWith('.zip'));

if (zipFiles.length === 0) {
  console.error(`No zip files found in ${absoluteDir}`);
  process.exit(1);
}

// 重新命名第一個找到的 zip 檔案
const oldPath = path.join(absoluteDir, zipFiles[0]);
const newPath = path.join(absoluteDir, `${newName}.zip`);
fs.renameSync(oldPath, newPath);
console.log(`Renamed ${oldPath} to ${newPath}`);
