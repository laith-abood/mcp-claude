import { Logger } from './logger.js';

export class ErrorHandler {
  private static logger = Logger.getInstance();

  static handleError(error: Error): void {
    this.logger.error('An error occurred', error);
  }
}
