export default {
  paths: ["tests/cucumber/features/**/*.feature"],
  import: ["tests/cucumber/support/**/*.ts", "tests/cucumber/steps/**/*.ts"],
  format: [
    "progress-bar",
    "summary",
    "json:.cucumber-report/report.json",
  ],
  formatOptions: { snippetInterface: "async-await" },
  parallel: 1,
};
