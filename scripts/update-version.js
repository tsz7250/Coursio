const fs = require('fs');
const path = require('path');

// 取得命令列參數
let version = process.argv[2];
if (!version) {
  console.error('Error: Please provide a version (e.g., v1.0.0 or 1.0.0)');
  process.exit(1);
}

// 移除前導 'v' 字元
if (version.startsWith('v')) {
  version = version.substring(1);
}

// 1. 更新 package.json
const packageJsonPath = path.join(__dirname, '../package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = version;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  console.log(`Updated package.json version to ${version}`);
} else {
  console.error('Error: package.json not found');
  process.exit(1);
}

// 2. 更新 package-lock.json
const packageLockJsonPath = path.join(__dirname, '../package-lock.json');
if (fs.existsSync(packageLockJsonPath)) {
  const packageLockJson = JSON.parse(fs.readFileSync(packageLockJsonPath, 'utf8'));
  if (packageLockJson.version) {
    packageLockJson.version = version;
  }
  if (packageLockJson.packages && packageLockJson.packages['']) {
    packageLockJson.packages[''].version = version;
  }
  fs.writeFileSync(packageLockJsonPath, JSON.stringify(packageLockJson, null, 2) + '\n', 'utf8');
  console.log(`Updated package-lock.json version to ${version}`);
}

// 3. 更新 AboutPage.vue
const aboutPagePath = path.join(__dirname, '../renderer/src/pages/AboutPage.vue');
if (fs.existsSync(aboutPagePath)) {
  let aboutPageContent = fs.readFileSync(aboutPagePath, 'utf8');
  const updatedContent = aboutPageContent.replace(
    /const version = '.*?';/,
    `const version = '${version}';`
  );
  if (aboutPageContent !== updatedContent) {
    fs.writeFileSync(aboutPagePath, updatedContent, 'utf8');
    console.log(`Updated AboutPage.vue version to ${version}`);
  } else {
    console.warn('Warning: Could not find const version line in AboutPage.vue');
  }
} else {
  console.warn('Warning: AboutPage.vue not found');
}
