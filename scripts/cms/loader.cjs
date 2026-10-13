const path = require('node:path');
const { pathToFileURL } = require('node:url');
module.exports = function copyLoader(source) {
  const done = this.async();
  const file = path.relative(this.rootContext, this.resourcePath).replaceAll(path.sep, '/');
  this.addDependency(path.join(__dirname, 'instrument.mjs'));
  this.addDependency(path.join(__dirname, 'catalog.mjs'));
  import(pathToFileURL(path.join(__dirname, 'instrument.mjs')).href)
    .then(({ instrument }) => done(null, instrument(file, source, this.getOptions().development)))
    .catch(done);
};
