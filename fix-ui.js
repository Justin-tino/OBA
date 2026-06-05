const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir(path.join(__dirname, 'views'), function(filePath) {
  if (filePath.endsWith('.html')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    
    // Remove cart SVG inside topbar-title
    const titleRegex = /<span class="topbar-title">\s*<svg[^>]*>.*?<\/svg>\s*(.*?)<\/span>/g;
    if (titleRegex.test(content)) {
      content = content.replace(titleRegex, '<span class="topbar-title">$1</span>');
      changed = true;
    }
    
    // Add logout confirmation
    const logoutRegex = /href="\/logout"(?! onclick)/g;
    if (logoutRegex.test(content)) {
      content = content.replace(logoutRegex, 'href="/logout" onclick="return confirm(\'Are you sure you want to logout?\');"');
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  }
});
