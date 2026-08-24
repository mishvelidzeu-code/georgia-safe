// Extends app.json with the Google Maps keys, which are read from .env so they
// never land in the public GitHub repo (app.json is committed, .env is not).
//
// The iOS key is required at build time: MapScreen renders with
// PROVIDER_GOOGLE, and without a key Google Maps shows a blank grey map.
//
// eas-cli sets EXPO_NO_DOTENV=1 whenever it evaluates this file, so .env is
// deliberately ignored for any `eas` command — the value has to exist as an EAS
// environment variable instead (visibility `sensitive`, not `secret`: eas-cli
// resolves this config locally and cannot read secrets):
//   eas env:create --name GOOGLE_MAPS_IOS_KEY --value <key> \
//     --environment development --visibility sensitive
//
// We warn rather than throw on a missing key: every `eas` command (including
// `eas env:create` itself) evaluates this file first, so throwing would lock us
// out of the command needed to supply the key.
module.exports = ({ config }) => {
  const iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_IOS_KEY;
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_KEY;

  if (!iosGoogleMapsApiKey) {
    console.warn(
      '\n[app.config.js] GOOGLE_MAPS_IOS_KEY is not set — the map will render blank.\n' +
        '  Local runs: add it to .env\n' +
        '  EAS builds: eas env:create --name GOOGLE_MAPS_IOS_KEY --value <key> ' +
        '--environment development --visibility sensitive\n',
    );
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        'react-native-maps',
        androidGoogleMapsApiKey
          ? { iosGoogleMapsApiKey, androidGoogleMapsApiKey }
          : { iosGoogleMapsApiKey },
      ],
    ],
  };
};
