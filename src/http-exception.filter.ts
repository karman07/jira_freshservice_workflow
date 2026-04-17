import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    // Default to 500 if not a standard HttpException
    const status = 
      exception instanceof HttpException
        ? exception.getStatus()
        : (exception?.status || exception?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR);

    const exceptionResponse = 
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: exception?.message || 'Internal server error', error: exception?.name };

    // We only want to aggressively log 400 Bad Requests and above
    if (status >= 400) {
      this.logger.error(
        `\n${'═'.repeat(60)}\n` +
        `❌ HTTP ${status} Error on ${request.method} ${request.url}\n` +
        `Request Headers: JSON.stringify(request.headers)\n` +
        `Query Params: ${JSON.stringify(request.query)}\n` +
        `Error Detail: ${JSON.stringify(exceptionResponse, null, 2)}\n` +
        `${'═'.repeat(60)}`
      );

      // Try capturing raw body if available (sometimes body-parser attaches a raw body as string buff)
      // Usually, if JSON is malformed, request.body is empty {} but the error contains the details.
      if (status === 400 && exception instanceof SyntaxError) {
        this.logger.error(`🚨 MALFORMED JSON DETECTED! The webhook payload is invalid JSON.`);
        if ((exception as any).body) {
           this.logger.error(`Raw broken body snippet: ${(exception as any).body.substring(0, 500)}`);
        }
      }
    }

    // Still return the normal response so things don't hang
    response.status(status).json(exceptionResponse);
  }
}
