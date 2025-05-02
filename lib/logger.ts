import chalk from 'chalk';

export enum LogLevel {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

export const log = {
  info: (message: string): void => {
    console.log(chalk.blue(`ℹ️ ${message}`));
  },

  success: (message: string): void => {
    console.log(chalk.green(`✅ ${message}`));
  },

  warning: (message: string): void => {
    console.log(chalk.yellow(`⚠️ ${message}`));
  },

  error: (message: string): void => {
    console.log(chalk.red(`❌ ${message}`));
  },

  debug: (message: string): void => {
    console.log(chalk.gray(`🔍 ${message}`));
  },

  check: (name: string, result: boolean, message: string): void => {
    if (result) {
      log.success(`${name} - ${message}`);
    } else {
      log.error(`${name} - ${message}`);
    }
  },

  table: (data: any[]): void => {
    console.table(data);
  },
};
