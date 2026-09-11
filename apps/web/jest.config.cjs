/* global module */
/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "jsdom",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          jsx: "react-jsx",
        },
      },
    ],
  },
  moduleNameMapper: {
    "\\.(css)$": "<rootDir>/test/style-mock.cjs",
  },
  roots: ["<rootDir>"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
};
