import eslintConfigPrettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";

export default [
  ...pluginVue.configs["flat/recommended"],
  eslintConfigPrettier,
  {
    ignores: ["dist/**"],
    rules: {
      "vue/attribute-hyphenation": "off",
      "vue/valid-template-root": "off",
    },
  },
];
