using BurgerHouse.Domain.Entities;

namespace BurgerHouse.Domain.Tests;

public sealed class AdminAuditLogTests
{
    private static readonly DateTime UtcNow =
        new(
            2026,
            10,
            13,
            15,
            0,
            0,
            DateTimeKind.Utc
        );

    [Fact]
    public void CreatesValidAdminAuditLog()
    {
        var log =
            new AdminAuditLog(
                7,
                "Admin",
                "ProductUpdated",
                "Product",
                "42",
                """{"price":{"from":10,"to":12}}""",
                UtcNow
            );

        Assert.Equal(
            7,
            log.AdminUserId
        );

        Assert.Equal(
            "Admin",
            log.ActorType
        );

        Assert.Equal(
            "ProductUpdated",
            log.Action
        );

        Assert.Equal(
            "Product",
            log.EntityType
        );

        Assert.Equal(
            "42",
            log.EntityId
        );

        Assert.Equal(
            UtcNow,
            log.CreatedAtUtc
        );
    }

    [Fact]
    public void AllowsNonAdminActorWithoutAdminUser()
    {
        var log =
            new AdminAuditLog(
                null,
                "Provider",
                "PaymentSynchronized",
                "Payment",
                "15",
                """{"status":{"from":"Pending","to":"Approved"}}""",
                UtcNow
            );

        Assert.Null(
            log.AdminUserId
        );

        Assert.Equal(
            "Provider",
            log.ActorType
        );
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void RejectsBlankActorType(
        string actorType)
    {
        Assert.Throws<ArgumentException>(
            () =>
                new AdminAuditLog(
                    1,
                    actorType,
                    "Action",
                    "Entity",
                    "1",
                    "{}",
                    UtcNow
                )
        );
    }

    [Fact]
    public void RejectsNonUtcTimestamp()
    {
        var local =
            new DateTime(
                2026,
                10,
                13,
                12,
                0,
                0,
                DateTimeKind.Local
            );

        Assert.Throws<ArgumentException>(
            () =>
                new AdminAuditLog(
                    1,
                    "Admin",
                    "Action",
                    "Entity",
                    "1",
                    "{}",
                    local
                )
        );
    }

    [Fact]
    public void RejectsOversizedChanges()
    {
        var oversized =
            new string(
                'x',
                8001
            );

        Assert.Throws<ArgumentException>(
            () =>
                new AdminAuditLog(
                    1,
                    "Admin",
                    "Action",
                    "Entity",
                    "1",
                    oversized,
                    UtcNow
                )
        );
    }
}