/**
 * Script de build et packaging pour The Quiz Solver Extension
 * Usage:
 *   node build.js [firefox|chrome|all]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Liste des fichiers et dossiers à inclure dans l'extension
const ASSETS_TO_COPY = [
  'background.js',
  'content.js',
  'content.css',
  '_locales',
  'images'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    ensureDir(dest);
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function zipDirectory(sourceDir, targetZipPath) {
  let finalPath = targetZipPath;
  try {
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }
  } catch (e) {
    // Si le fichier est verrouillé en lecture (ex: navigateur en cours d'upload), on crée une alternative
    const dir = path.dirname(finalPath);
    const ext = path.extname(finalPath);
    const base = path.basename(finalPath, ext);
    finalPath = path.join(dir, `${base}-amo${ext}`);
    try {
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    } catch (_) {}
    console.warn(`⚠️ Fichier ${path.basename(targetZipPath)} verrouillé par un processus, utilisation de : ${path.basename(finalPath)}`);
  }

  // Utilisation de tar natif (Windows 10+, Linux, macOS)
  try {
    execSync(`tar -a -c -f "${finalPath}" *`, { cwd: sourceDir, stdio: 'pipe' });
  } catch (e) {
    // Repli sur PowerShell Compress-Archive si besoin
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}/*' -DestinationPath '${finalPath}' -Force"`, { stdio: 'pipe' });
  }

  return finalPath;
}

function buildTarget(target) {
  console.log(`\n📦 Préparation du build pour : ${target.toUpperCase()}...`);

  ensureDir(DIST_DIR);
  const stagingDir = path.join(DIST_DIR, `.staging-${target}`);
  cleanDir(stagingDir);
  ensureDir(stagingDir);

  // 1. Copie des assets communs
  ASSETS_TO_COPY.forEach(asset => {
    const srcPath = path.join(SRC_DIR, asset);
    const destPath = path.join(stagingDir, asset);
    if (fs.existsSync(srcPath)) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      console.warn(`⚠️ Attention : asset manquant "${asset}"`);
    }
  });

  // 2. Sélection et copie du bon manifest sous le nom "manifest.json"
  let manifestSource = '';
  if (target === 'firefox') {
    manifestSource = path.join(SRC_DIR, 'manifest.firefox.json');
  } else {
    manifestSource = path.join(SRC_DIR, 'manifest.json');
  }

  if (!fs.existsSync(manifestSource)) {
    throw new Error(`Manifest source introuvable : ${manifestSource}`);
  }

  const manifestContent = JSON.parse(fs.readFileSync(manifestSource, 'utf8'));
  const version = manifestContent.version || 'unknown';

  fs.copyFileSync(manifestSource, path.join(stagingDir, 'manifest.json'));

  // 3. Création de l'archive ZIP
  const zipFileName = `thequizsolver-${target}-v${version}.zip`;
  const zipFilePath = path.join(DIST_DIR, zipFileName);

  const actualZipPath = zipDirectory(stagingDir, zipFilePath);

  // 4. Nettoyage du dossier temporaire
  cleanDir(stagingDir);

  const stats = fs.statSync(actualZipPath);
  const sizeKb = (stats.size / 1024).toFixed(1);

  console.log(`✅ Build ${target.toUpperCase()} réussi !`);
  console.log(`   Fichier : dist/${path.basename(actualZipPath)} (${sizeKb} Ko)`);
  if (target === 'firefox') {
    console.log(`   Gecko ID : ${manifestContent.browser_specific_settings?.gecko?.id || 'non défini'}`);
    console.log(`   Prêt à être téléversé sur https://addons.mozilla.org/developers/`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const target = (args[0] || 'all').toLowerCase();

  console.log('==================================================');
  console.log('   The Quiz Solver - Extension Packaging Tool     ');
  console.log('==================================================');

  if (target === 'firefox') {
    buildTarget('firefox');
  } else if (target === 'chrome') {
    buildTarget('chrome');
  } else if (target === 'all') {
    buildTarget('chrome');
    buildTarget('firefox');
  } else {
    console.error(`Cible inconnue : "${target}". Utilisez "firefox", "chrome", ou "all".`);
    process.exit(1);
  }

  console.log('\n🎉 Tout est prêt dans le dossier "dist/".');
}

main();
