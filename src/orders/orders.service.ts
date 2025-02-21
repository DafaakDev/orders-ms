import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('Orders Service');

  async onModuleInit() {
    await this.$connect();
    this.logger.log('DATABASE CONNECTED');
  }

  create(createOrderDto: CreateOrderDto) {
    return this.order.create({ data: createOrderDto });
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const { page = 1, limit = 10, status } = orderPaginationDto;

    const count = await this.order.count({
      where: {
        status: status,
      },
    });

    const totalPages = Math.ceil(count / limit);

    return {
      data: await this.order.findMany({
        take: limit,
        skip: (page - 1) * limit,
        where: {
          status,
        },
      }),
      meta: {
        count,
        totalPages,
        page,
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findUnique({ where: { id } });
    if (!order) {
      this.logger.error(`Order with id ${id} not found`);
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not found`,
      });
    }

    return order;
  }

  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;
    try {
      return await this.order.update({
        where: {
          id,
        },
        data: { status },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        this.logger.error(`Order with id ${id} not found`);
        throw new RpcException({
          status: HttpStatus.NOT_FOUND,
          message: `Order with id ${id} not found`,
        });
      }
      this.logger.error(`Error: `, error.message);
      throw new RpcException({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      });
    }
  }
}
