const path = require('path');

function srcTo(p) {
  return path.relative(path.resolve(__dirname, '../src'), p);
}

const ept = {
  resolveSnapshotPath: testPath => {
    const relativeP = srcTo(testPath);
    const snapPath = path.resolve(
      process.cwd(),
      '__snapshot__',
      relativeP.replace(/\//g, '.').replace(/\.test\.ts/, '.ts.snap')
    );
    return snapPath;
  },

  resolveTestPath: (snapshotFilePath, snapshotExtension) => {
    const name = path.basename(snapshotFilePath, '.ts.snap');
    const namePath = name.replace(/\./g, '/') + '.test.ts';
    // xxx.xxx.ts.snap
    const testPath = path.resolve(__dirname, '../src', namePath);
    return testPath;
  },

  testPathForConsistencyCheck: path.resolve(__dirname, '../src/sample.test.ts')
};

module.exports = ept;
