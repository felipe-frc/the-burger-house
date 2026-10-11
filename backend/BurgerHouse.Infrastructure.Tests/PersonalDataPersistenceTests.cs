using System.Security.Cryptography;
using System.Text;
using System.Net;
using System.Text.Json;
using BurgerHouse.Application.Payments.PrepareCheckoutPayment;
using BurgerHouse.Infrastructure.Payments.PagBank;
using BurgerHouse.Infrastructure.Repositories;
using Microsoft.Extensions.Options;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Privacy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BurgerHouse.Infrastructure.Tests;

public class PersonalDataPersistenceTests
{
    private const string PreviousMigration = "20261009010141_AddPaymentFinancialHistory";

    [Theory]
    [InlineData("delivery")]
    [InlineData("pickup")]
    public async Task FileDatabaseStoresOnlyProtectedValuesAndMaterializesPlaintext(string type)
    {
        using var fixture = new Fixture();
        await using (var db = fixture.Open())
        {
            await db.Database.MigrateAsync();
            var order = new Order(0, type, "Cliente", "11999990000", "cliente@teste.com", "52998224725",
                type == "delivery" ? "38400-000" : null,
                type == "delivery" ? "Rua Teste" : null,
                type == "delivery" ? "10" : null,
                type == "delivery" ? "Centro" : null,
                type == "delivery" ? "Uberlândia" : null,
                type == "delivery" ? "Apto ç" : null, "Sem cebola 🍔");
            order.AddItem(new OrderItem(1, 1, 43.90m, "Observação do item"));
            db.Add(order);
            await db.SaveChangesAsync();
            foreach (var field in new[] { "CustomerPhone", "CustomerEmail", "CustomerTaxId", "Observation",
                "ZipCode", "Street", "HouseNumber", "Neighborhood", "City", "Complement" })
            {
                // Field names are fixed test constants, never user input.
#pragma warning disable EF1002 // SQL identifiers cannot be parameters; all identifiers are listed above.
                var stored = await db.Database.SqlQueryRaw<string?>($"SELECT {field} AS Value FROM Orders").SingleAsync();
#pragma warning restore EF1002
                if (type == "pickup" && field is "ZipCode" or "Street" or "HouseNumber" or "Neighborhood" or "City" or "Complement")
                    Assert.Null(stored);
                else Assert.StartsWith("enc:v1:", stored);
            }
            Assert.StartsWith("enc:v1:", await db.Database.SqlQueryRaw<string>("SELECT Observation AS Value FROM OrderItems").SingleAsync());
            Assert.False(db.Database.HasPendingModelChanges());
        }
        await using (var db = fixture.Open())
        {
            var order = await db.Orders.Include(o => o.Items).SingleAsync();
            Assert.Equal("52998224725", order.CustomerTaxId);
            Assert.Equal("cliente@teste.com", order.CustomerEmail);
            Assert.Equal("11999990000", order.CustomerPhone);
            Assert.Equal("Sem cebola 🍔", order.Observation);
            Assert.Equal("Observação do item", order.Items.Single().Observation);
            Assert.Equal(type == "delivery" ? "Rua Teste" : null, order.Street);
            Assert.Equal(type == "delivery" ? "38400-000" : null, order.ZipCode);
            Assert.Equal(type == "delivery" ? "10" : null, order.HouseNumber);
            Assert.Equal(type == "delivery" ? "Centro" : null, order.Neighborhood);
            Assert.Equal(type == "delivery" ? "Uberlândia" : null, order.City);
            Assert.Equal(type == "delivery" ? "Apto ç" : null, order.Complement);
            Assert.False(db.ChangeTracker.HasChanges());
            var before = await db.Database.SqlQueryRaw<string>("SELECT CustomerTaxId AS Value FROM Orders").SingleAsync();
            await db.SaveChangesAsync();
            Assert.Equal(before, await db.Database.SqlQueryRaw<string>("SELECT CustomerTaxId AS Value FROM Orders").SingleAsync());
        }
        foreach (var file in new[] { fixture.Path, fixture.Path + "-wal" }.Where(File.Exists))
        {
            var content = Encoding.UTF8.GetString(await File.ReadAllBytesAsync(file));
            foreach (var value in new[] { "52998224725", "cliente@teste.com", "11999990000", "Rua Teste", "Sem cebola" })
                Assert.DoesNotContain(value, content);
        }
    }

    [Fact]
    public async Task CheckoutReceivesPlaintextFromANewContext()
    {
        using var fixture = new Fixture();
        int orderId;
        await using (var db = fixture.Open())
        {
            await db.Database.MigrateAsync();
            var order = new Order(0, "pickup", "Cliente Teste", "11999990000", "cliente@teste.com", "52998224725");
            order.AddItem(new OrderItem(1, 1, 43.90m));
            db.Add(order);
            await db.SaveChangesAsync();
            orderId = order.Id;
        }
        await using var fresh = fixture.Open();
        var prepared = await new PrepareCheckoutPaymentHandler(new OrderRepository(fresh), new PaymentRepository(fresh)).HandleAsync(orderId);
        using var stub = new CheckoutStub();
        using var http = new HttpClient(stub);
        var service = new PagBankCheckoutService(http, Options.Create(new PagBankOptions
        {
            BaseUrl = "https://sandbox.api.pagseguro.com/", Token = "test-placeholder",
            RedirectUrl = "https://example.invalid/", NotificationUrl = "https://example.invalid/api/webhooks/pagbank"
        }));
        await service.GetOrCreateAsync(prepared.Payment, prepared.Customer);
        using var json = JsonDocument.Parse(stub.Body!);
        var customer = json.RootElement.GetProperty("customer");
        Assert.Equal("Cliente Teste", customer.GetProperty("name").GetString());
        Assert.Equal("cliente@teste.com", customer.GetProperty("email").GetString());
        Assert.Equal("52998224725", customer.GetProperty("tax_id").GetString());
        Assert.Equal("999990000", customer.GetProperty("phone").GetProperty("number").GetString());
        Assert.DoesNotContain("enc:v1:", stub.Body!);
    }

    private sealed class CheckoutStub : HttpMessageHandler
    {
        public string? Body { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            using var json = JsonDocument.Parse(Body);
            var reference = json.RootElement.GetProperty("reference_id").GetString();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new
                {
                    id = "CHEC_1", reference_id = reference, status = "ACTIVE",
                    links = new[] { new { rel = "PAY", href = "https://pagamento.pagbank.com.br/checkout/CHEC_1" } }
                }), Encoding.UTF8, "application/json")
            };
        }
    }

    [Fact]
    public async Task LegacyUpgradeAndStructuralDowngradeDoNotRewriteOrLoseData()
    {
        using var fixture = new Fixture();
        await using var db = fixture.Open();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync(PreviousMigration);
        await db.Database.ExecuteSqlRawAsync("INSERT INTO Orders (DeliveryFee,Status,CreatedAt,OrderType,CustomerName,CustomerPhone,CustomerEmail,CustomerTaxId) VALUES ('0',1,'2026-10-01','pickup','Legado','11999990000','cliente@teste.com','52998224725')");
        await migrator.MigrateAsync();
        Assert.Equal("52998224725", await db.Database.SqlQueryRaw<string>("SELECT CustomerTaxId AS Value FROM Orders").SingleAsync());
        var order = await db.Orders.SingleAsync();
        Assert.Equal("cliente@teste.com", order.CustomerEmail);
        db.Entry(order).Property(o => o.CustomerPhone).CurrentValue = "11988880000";
        await db.SaveChangesAsync();
        var protectedPhone = await db.Database.SqlQueryRaw<string>("SELECT CustomerPhone AS Value FROM Orders").SingleAsync();
        Assert.StartsWith("enc:v1:", protectedPhone);
        await migrator.MigrateAsync(PreviousMigration);
        Assert.Equal(protectedPhone, await db.Database.SqlQueryRaw<string>("SELECT CustomerPhone AS Value FROM Orders").SingleAsync());
        await migrator.MigrateAsync();
        db.ChangeTracker.Clear();
        order = await db.Orders.SingleAsync();
        Assert.Equal("52998224725", order.CustomerTaxId);
        Assert.Equal("11988880000", order.CustomerPhone);
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Fact]
    public async Task AnotherContextKeyCannotReuseCachedDecryptorOrMaterializeCorruptData()
    {
        using var fixture = new Fixture();
        await using (var db = fixture.Open())
        {
            await db.Database.EnsureCreatedAsync();
            db.Add(new Order(0, "pickup", "Cliente", "11999990000", "cliente@teste.com", "52998224725"));
            await db.SaveChangesAsync();
        }
        await using var wrong = fixture.Open(new AesGcmPersonalDataProtector(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))));
        await Assert.ThrowsAsync<CryptographicException>(() => wrong.Orders.SingleAsync());
        await using var correct = fixture.Open();
        await correct.Database.ExecuteSqlRawAsync("UPDATE Orders SET CustomerTaxId = 'enc:v1:broken'");
        await Assert.ThrowsAsync<CryptographicException>(() => correct.Orders.SingleAsync());
    }

    private sealed class Fixture : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"burger-privacy-{Guid.NewGuid()}.db");
        public BurgerHouseDbContext Open(AesGcmPersonalDataProtector? protector = null) => new(
            new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite($"Data Source={Path};Pooling=False").Options,
            protector ?? TestPersonalData.Protector);
        public void Dispose()
        {
            foreach (var file in new[] { Path, Path + "-wal", Path + "-shm" }) File.Delete(file);
        }
    }
}
