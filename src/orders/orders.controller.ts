import {Controller, ParseUUIDPipe} from '@nestjs/common';
import {EventPattern, MessagePattern, Payload} from '@nestjs/microservices';
import {OrdersService} from './orders.service';
import {CreateOrderDto} from './dto/create-order.dto';
import {OrderPaginationDto} from './dto/order-pagination.dto';
import {ChangeOrderStatusDto, PaidOrderDto} from './dto';

@Controller()
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {
    }

    @MessagePattern('createOrder')
    async create(@Payload() createOrderDto: CreateOrderDto) {
        const order = await this.ordersService.create(createOrderDto);
        const paymentSession = await this.ordersService.createPaymentSession(order);
        return {order, paymentSession};
    }

    @MessagePattern('findAllOrders')
    findAll(@Payload() orderPaginationDto: OrderPaginationDto) {
        return this.ordersService.findAll(orderPaginationDto);
    }

    @MessagePattern('findOneOrder')
    findOne(@Payload('id', ParseUUIDPipe) id: string) {
        return this.ordersService.findOne(id);
    }

    @MessagePattern('changeOrderStatus')
    update(@Payload() changeOrderStatus: ChangeOrderStatusDto) {
        return this.ordersService.changeOrderStatus(changeOrderStatus);
    }

    @EventPattern('payment.succeeded')
    async paidOrder(@Payload() paidOrderDto: PaidOrderDto) {
        console.log({paidOrderDto})
        await this.ordersService.markOrderAsPaid(paidOrderDto);
        return;
    }
}
