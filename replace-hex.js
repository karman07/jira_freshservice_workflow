const fs = require('fs');
const path = require('path');

const mappings = {
  '\\[#0a0a0f\\]': '[var(--bg-base)]',
  '\\[#111118\\]': '[var(--bg-surface)]',
  '\\[#1a1a2e\\]': '[var(--bg-elevated)]',
  '\\[#1e1e2e\\]': '[var(--border)]',
  '\\[#f4f4f5\\]': '[var(--text)]',
  '\\[#71717a\\]': '[var(--muted)]',
  '\\[#3b82f6\\]': '[var(--primary)]',
};

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let changed = false;
      for (const [hex, replacement] of Object.entries(mappings)) {
        const regex = new RegExp(hex, 'g');
        if (regex.test(content)) {
          content = content.replace(regex, replacement);
          changed = true;
        }
      }
      
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Updated ' + fullPath);
      }
    }
  }
}

processDir(path.join(__dirname, 'app'));
processDir(path.join(__dirname, 'components'));
processDir(path.join(__dirname, 'lib'));
