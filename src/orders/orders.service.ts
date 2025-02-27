import {
    HttpStatus,
    Inject,
    Injectable,
    Logger,
    OnModuleInit,
} from '@nestjs/common';
import {CreateOrderDto} from './dto/create-order.dto';
import {PrismaClient} from '@prisma/client';
import {ClientProxy, RpcException} from '@nestjs/microservices';
import {OrderPaginationDto} from './dto/order-pagination.dto';
import {ChangeOrderStatusDto, PaidOrderDto} from './dto';
import {NATS_SERVICE} from '../config/services';
import {firstValueFrom} from 'rxjs';
import {OrderWithProducts} from "./order-with-products.interface";

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
    private readonly logger = new Logger('Orders Service');

    constructor(@Inject(NATS_SERVICE) private readonly natsClient: ClientProxy) {
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
                this.natsClient.send({cmd: 'validate_products'}, ids),
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
                include: {
                    OrderItem: {
                        select: {
                            price: true,
                            quantity: true,
                            productId: true,
                        },
                    },
                },
            });

            return {
                ...order,
                OrderItem: order.OrderItem.map((orderItem) => {
                    return {
                        ...orderItem,
                        name: products.find((product) => product.id === orderItem.productId)
                            .name,
                    };
                }),
            };
        } catch (e) {
            this.logger.error('Create Order ERROR: ', e.message);
            throw new RpcException({
                status: HttpStatus.BAD_REQUEST,
                message: e.message,
            });
        }
    }

    async findAll(orderPaginationDto: OrderPaginationDto) {
        const {page = 1, limit = 10, status} = orderPaginationDto;

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
        const order = await this.order.findUnique({
            where: {id},
            include: {OrderItem: true},
        });
        if (!order) {
            this.logger.error(`Order with id ${id} not found`);
            throw new RpcException({
                status: HttpStatus.NOT_FOUND,
                message: `Order with id ${id} not found`,
            });
        }

        const productsId = order.OrderItem.map((orderItem) => orderItem.productId);

        const products: any[] = await firstValueFrom(
            this.natsClient.send({cmd: 'validate_products'}, productsId),
        );

        return {
            ...order,
            OrderItem: order.OrderItem.map((orderItem) => {
                return {
                    ...orderItem,
                    name: products.find((product) => product.id === orderItem.productId)
                        .name,
                };
            }),
        };
    }

    async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
        const {id, status} = changeOrderStatusDto;
        try {
            return await this.order.update({
                where: {
                    id,
                },
                data: {status},
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

    async createPaymentSession(order: OrderWithProducts) {
        const paymentSession = await firstValueFrom(this.natsClient.send('create.payment.session',
            {
                "metadata": {
                    "order": order.id
                },
                "line_items": order.OrderItem.map(item => ({
                    price_data: {
                        product_data: {
                            name: item.name
                        },
                        unit_amount: item.price * 100,
                    },
                    quantity: item.quantity
                }))
            }));
        console.log('Payment session: ', paymentSession);
        return paymentSession;
    }

    async markOrderAsPaid(paidOrderDto: PaidOrderDto) {
        this.logger.log('PAID ORDER');

        const orderUpdated = await this.order.update({
            where: {id: paidOrderDto.orderId},
            data: {
                status: 'PAID',
                paid: true,
                paidAt: new Date(),
                stripeChargeId: paidOrderDto.stripePaymentId,
                OrderReceipt: {
                    create: {
                        receipUrl: paidOrderDto.receiptUrl
                    }
                }
            }
        });

        return orderUpdated;
    }

}
