import {
  Catch,
  RpcExceptionFilter,
  ArgumentsHost,
  ExceptionFilter,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { object } from 'joi';

@Catch(RpcException)
// RpcExceptionFilter<RpcException>
export class RpcCustomExceptionFilter implements ExceptionFilter {
  catch(exception: RpcException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const rpcError = exception.getError();
    if (
      typeof rpcError === 'object' &&
      'status' in rpcError &&
      'message' in rpcError
    ) {
      const status = isNaN(+rpcError) ? 400 : rpcError.status;
      return response.status(status).json(rpcError);
    }

    return response.status(400).json({
      status: 400,
      message: rpcError,
    });
  }
}
