// @expo/vector-icons pulls in expo-font -> expo-asset at import time, and
// expo-asset isn't resolvable from Jest (it's nested under expo in
// node_modules). Icons are decorative in every component that uses them, so
// tests render a plain placeholder that keeps the name for assertions.
const React = require('react');
const { Text } = require('react-native');

function Icon(props) {
  return React.createElement(Text, { testID: props.testID }, props.name);
}

module.exports = Icon;
module.exports.default = Icon;
