import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';
import { PRODUCT_SERVICE } from '../config/services';
import { catchError, firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('Orders Service');

  constructor(
    @Inject(PRODUCT_SERVICE) private readonly productsClient: ClientProxy,
  ) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('DATABASE CONNECTED');
  }

  async create(createOrderDto: CreateOrderDto) {
    const ids = createOrderDto.items.map((item) => item.productId);
    try {
      const products: any[] = await firstValueFrom(
        this.productsClient.send({ cmd: 'validate_products' }, ids),
      );

      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(
          (prod) => prod.id === orderItem.productId,
        ).price;
        console.log(orderItem);
        return acc + price * orderItem.quantity;
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return orderItem.quantity + acc;
      }, 0);

      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              })),
            },
          },
        },

      });

      // return { totalAmount, totalItems, products, items: createOrderDto.items };
      return order;
    } catch (e) {
      this.logger.error('Create Order ERROR: ', e.message);
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: e.message,
      });
    }

    // return this.order.create({ data: createOrderDto });
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
