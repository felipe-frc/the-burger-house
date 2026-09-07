using BurgerHouse.Application.Abstractions.Payments;
using BurgerHouse.Infrastructure.Payments.MercadoPago;
using Xunit;

namespace BurgerHouse.Infrastructure.Tests.Payments.MercadoPago;

public class MercadoPagoStatusMapperTests
{
    [Theory]
    [InlineData("created")]
    [InlineData("processing")]
    [InlineData("action_required")]
    [InlineData("in_review")]
    public void Map_ShouldReturnPending_WhenStatusIsNotFinal(
        string status)
    {
        var result = MercadoPagoStatusMapper.Map(
            status,
            null
        );

        Assert.Equal(
            PaymentGatewayStatus.Pending,
            result
        );
    }

    [Fact]
    public void Map_ShouldReturnApproved_WhenPaymentWasAccredited()
    {
        var result = MercadoPagoStatusMapper.Map(
            "processed",
            "accredited"
        );

        Assert.Equal(
            PaymentGatewayStatus.Approved,
            result
        );
    }

    [Fact]
    public void Map_ShouldReturnPartiallyRefunded_WhenPaymentWasPartiallyRefunded()
    {
        var result = MercadoPagoStatusMapper.Map(
            "processed",
            "partially_refunded"
        );

        Assert.Equal(
            PaymentGatewayStatus.PartiallyRefunded,
            result
        );
    }

    [Fact]
    public void Map_ShouldReturnRejected_WhenPaymentFailed()
    {
        var result = MercadoPagoStatusMapper.Map(
            "failed",
            "rejected_by_issuer"
        );

        Assert.Equal(
            PaymentGatewayStatus.Rejected,
            result
        );
    }

    [Fact]
    public void Map_ShouldReturnExpired_WhenCancelledBecauseItExpired()
    {
        var result = MercadoPagoStatusMapper.Map(
            "canceled",
            "expired"
        );

        Assert.Equal(
            PaymentGatewayStatus.Expired,
            result
        );
    }

    [Fact]
    public void Map_ShouldReturnCancelled_WhenPaymentWasCancelled()
    {
        var result = MercadoPagoStatusMapper.Map(
            "canceled",
            null
        );

        Assert.Equal(
            PaymentGatewayStatus.Cancelled,
            result
        );
    }

    [Fact]
    public void Map_ShouldReturnExpired_WhenStatusIsExpired()
    {
        var result = MercadoPagoStatusMapper.Map(
            "expired",
            null
        );

        Assert.Equal(
            PaymentGatewayStatus.Expired,
            result
        );
    }

    [Fact]
    public void Map_ShouldReturnRefunded_WhenPaymentWasRefunded()
    {
        var result = MercadoPagoStatusMapper.Map(
            "refunded",
            null
        );

        Assert.Equal(
            PaymentGatewayStatus.Refunded,
            result
        );
    }

    [Fact]
    public void Map_ShouldReturnChargedBack_WhenPaymentWasChargedBack()
    {
        var result = MercadoPagoStatusMapper.Map(
            "charged_back",
            null
        );

        Assert.Equal(
            PaymentGatewayStatus.ChargedBack,
            result
        );
    }

    [Fact]
    public void Map_ShouldReturnPending_WhenStatusIsUnknown()
    {
        var result = MercadoPagoStatusMapper.Map(
            "new_unknown_status",
            null
        );

        Assert.Equal(
            PaymentGatewayStatus.Pending,
            result
        );
    }

    [Fact]
    public void Map_ShouldIgnoreCaseAndWhitespace()
    {
        var result = MercadoPagoStatusMapper.Map(
            "  PROCESSED  ",
            "  ACCREDITED  "
        );

        Assert.Equal(
            PaymentGatewayStatus.Approved,
            result
        );
    }
}