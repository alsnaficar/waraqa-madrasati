module.exports = {
  apps: [
    {
      name: "waraqah-madrasati",
      cwd: "/root/waraqa-madrasati",
      script: ".output/server/index.mjs",
      interpreter: "node",
      node_args: "-r dotenv/config",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "0.0.0.0",
      },
    },
  ],
};
