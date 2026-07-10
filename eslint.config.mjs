const eslintConfig = [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "public/pdf.worker.min.mjs",
    ],
  },
  {
    rules: {
      "react-hooks/incompatible-library": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
