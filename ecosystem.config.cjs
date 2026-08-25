module.exports = {
  apps: [
    {
      name: "waraqah-madrasati",
      cwd: "/root/waraqa-madrasati",
      script: ".output/server/index.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "0.0.0.0",
      },
    },
  ],
};
