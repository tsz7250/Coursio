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
const targetFiles = files.filter(f => f.endsWith('.zip') || f.endsWith('.exe'));

if (targetFiles.length === 0) {
  console.error(`No zip or exe files found in ${absoluteDir}`);
  process.exit(1);
}

// 重新命名第一個找到的檔案，保留原本的副檔名
const targetFile = targetFiles[0];
const ext = path.extname(targetFile);
const oldPath = path.join(absoluteDir, targetFile);
const newPath = path.join(absoluteDir, `${newName}${ext}`);
fs.renameSync(oldPath, newPath);
console.log(`Renamed ${oldPath} to ${newPath}`);
