const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
  // Download Chrome (default `skipDownload: false`).
  chrome: {
    skipDownload: false,
  }
}; 