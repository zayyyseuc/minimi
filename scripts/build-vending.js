const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'public', 'vending');
const output = path.join(root, 'dist');
const nested = path.join(output, 'vending');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, nested, { recursive: true });
fs.copyFileSync(path.join(source, 'index.html'), path.join(output, 'index.html'));

console.log('Built the public-only Zai Vending Machine in dist/.');
