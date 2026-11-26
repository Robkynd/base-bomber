// Build basebomber-standalone.html: inline style.css + game.js + wallet.js
// into index.html, and embed concept.webp as a base64 data URI.
// Usage: node build-standalone.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;

let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
const gameJs = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
const walletJs = fs.readFileSync(path.join(dir, 'wallet.js'), 'utf8');
const imgB64 = fs.readFileSync(path.join(dir, 'concept.webp')).toString('base64');
const splashImgB64 = fs.readFileSync(path.join(dir, 'splash-hero.webp')).toString('base64');

html = html.replace(
  '<link rel="stylesheet" href="style.css">',
  '<style>\n' + css + '\n</style>'
);
html = html.replace(
  'src="concept.webp"',
  'src="data:image/webp;base64,' + imgB64 + '"'
);
html = html.replace(
  'src="splash-hero.webp"',
  'src="data:image/webp;base64,' + splashImgB64 + '"'
);
html = html.replace(
  '<script src="game.js"></script>',
  '<script>\n' + gameJs + '\n</script>'
);
html = html.replace(
  '<script src="wallet.js"></script>',
  '<script>\n' + walletJs + '\n</script>'
);

for (const needle of ['style.css', 'game.js', 'wallet.js', 'concept.webp', 'splash-hero.webp']) {
  if (html.includes('href="' + needle + '"') || html.includes('src="' + needle + '"')) {
    throw new Error('un-inlined reference remains: ' + needle);
  }
}
fs.writeFileSync(path.join(dir, 'basebomber-standalone.html'), html);
console.log('basebomber-standalone.html written,', html.length, 'bytes');
