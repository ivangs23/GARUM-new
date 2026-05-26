#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_PATH = join(ROOT, 'apps/desktop/package.json');

const bump = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error(`Invalid bump type: "${bump}". Use: patch | minor | major`);
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
const shOut = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();

const status = shOut('git status --porcelain');
if (status) {
  console.error('Working tree not clean. Commit or stash changes before releasing.');
  console.error(status);
  process.exit(1);
}

const branch = shOut('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`Releases must run from "main". Current branch: "${branch}".`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));
const [maj, min, pat] = pkg.version.split('.').map(Number);
const next =
  bump === 'major' ? `${maj + 1}.0.0` :
  bump === 'minor' ? `${maj}.${min + 1}.0` :
                     `${maj}.${min}.${pat + 1}`;

const tag = `desktop-v${next}`;

if (shOut(`git tag --list ${tag}`)) {
  console.error(`Tag ${tag} already exists locally. Aborting.`);
  process.exit(1);
}

console.log(`\nBumping garum-desktop: ${pkg.version} → ${next}`);
console.log(`Tag: ${tag}\n`);

pkg.version = next;
writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');

sh('git add apps/desktop/package.json');
sh(`git commit -m "chore(desktop): release ${tag}"`);
sh(`git tag ${tag}`);
sh('git push origin HEAD --follow-tags');

console.log(`\nRelease ${tag} pushed. Track build:`);
console.log(`  https://github.com/ivangs23/GARUM-new/actions`);
