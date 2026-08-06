function readFile() {
  throw new Error('readFile cannot be called from the edge runtime.');
}

module.exports = { readFile };
