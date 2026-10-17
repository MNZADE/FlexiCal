const { withProjectBuildGradle } = require('expo/config-plugins');

const workManagerDependency = "resolutionStrategy.force 'androidx.work:work-runtime-ktx:2.8.1'";

module.exports = function withWorkManagerVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes(workManagerDependency)) return config;

    config.modResults.contents = `${contents}

allprojects {
    configurations.all {
        ${workManagerDependency}
    }
}
`;
    return config;
  });
};
