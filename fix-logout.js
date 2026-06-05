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
    
    // Replace the bad logout onclick
    const badLogoutRegex = /href="\/logout" onclick="return confirm\('Are you sure you want to logout\?'\);"/g;
    if (badLogoutRegex.test(content)) {
      content = content.replace(badLogoutRegex, 'href="javascript:void(0)" onclick="confirm(\'Are you sure you want to logout?\', () => window.location.href=\'/logout\');"');
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed logout in', filePath);
    }
  }
});
