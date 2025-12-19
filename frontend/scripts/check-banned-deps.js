const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

const banned = [
    '@davatar/react',
    'davatar',
    'ens-normalize',
    '@adraffy/ens-normalize',
    '@adraffy'
];

function readJson(p) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_e) {
        return null;
    }
}

function findBannedInDeps(deps) {
    if (!deps) return [];
    return Object.keys(deps).filter((name) => {
        return banned.some(b => name === b || name.startsWith(b + '/') || name.startsWith(b.replace('@', '') + '/'));
    });
}

const pkg = readJson(pkgPath);
const lock = readJson(lockPath);

let found = [];
found.push(...findBannedInDeps(pkg && pkg.dependencies));
found.push(...findBannedInDeps(pkg && pkg.devDependencies));

if (lock && lock.dependencies) {
    found.push(...Object.keys(lock.dependencies).filter(n => banned.includes(n)));
}

found = Array.from(new Set(found));

if (found.length) {
    console.error('ERROR: Banned dependency detected:', found.join(', '));
    process.exit(1);
} else {
    console.log('No banned dependencies found.');
}
