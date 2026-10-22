// Folder with the shared test tiles: app/src/test/resources/street-tiles in the app repo,
// test/fixtures in the public walkabout-tiles repo (a copy of this folder).
const fs = require('fs');
const path = require('path');

const inApp = path.join(__dirname, '..', '..', 'app', 'src', 'test', 'resources', 'street-tiles');
module.exports = fs.existsSync(inApp) ? inApp : path.join(__dirname, 'test', 'fixtures');
