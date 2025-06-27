import chalk from 'chalk';

export const logInfo = (msg: string) => {
  console.log(chalk.blue(`ℹ️  ${msg}`));
};

export const logSuccess = (msg: string) => {
  console.log(chalk.green(`✅ ${msg}`));
};

export const logWarning = (msg: string) => {
  console.log(chalk.yellow(`⚠️  ${msg}`));
};

export const logError = (msg: string) => {
  console.error(chalk.red(`❌ ${msg}`));
};
