using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Domain.Enums;
using BurgerHouse.Infrastructure.Admin;
using BurgerHouse.Infrastructure.Persistence;
using BurgerHouse.Infrastructure.Privacy;
using Microsoft.EntityFrameworkCore;

if (args is ["--describe"])
{
    var protector = new AesGcmPersonalDataProtector(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
    using var sqlite = new BurgerHouseDbContext(new DbContextOptionsBuilder<BurgerHouseDbContext>()
        .UseSqlite("Data Source=:memory:").Options, protector);
    using var postgres = new PostgresContext(new DbContextOptionsBuilder<PostgresContext>()
        .UseNpgsql("Host=127.0.0.1;Database=not_opened").Options, protector);
    Console.WriteLine(JsonSerializer.Serialize(new {
        assembly = typeof(BurgerHouseDbContext).Assembly.GetName().Name,
        moduleId = typeof(BurgerHouseDbContext).Module.ModuleVersionId,
        sqlite = sqlite.Database.GetMigrations().ToArray(),
        postgresql = postgres.Database.GetMigrations().ToArray()
    }));
    return;
}

if (args.Length is < 2 or > 3 || args[0] is not ("--prepare" or "--verify" or "--owner-browser" or "--owner-dashboard"))
    throw new ArgumentException("Use --prepare, --verify, --owner-browser, or --owner-dashboard with an isolated root.");
var root = Path.GetFullPath(args[1]);
if (!Path.IsPathFullyQualified(args[1]) || !new DirectoryInfo(root).Name.StartsWith("burgerhouse-homologation-", StringComparison.Ordinal))
    throw new InvalidOperationException("An explicitly named, isolated absolute directory is required.");
Directory.CreateDirectory(root);
var path = Path.Combine(root, "burgerhouse.homologation.db");
var ownerDashboard = args[0] == "--owner-dashboard";
var ownerBrowser = ownerDashboard || args[0] == "--owner-browser";
if (ownerBrowser && (args.Length != 2 || !new DirectoryInfo(root).Name.StartsWith("burgerhouse-homologation-owner-test-", StringComparison.Ordinal) ||
    Directory.EnumerateFileSystemEntries(root).Any() || new DirectoryInfo(root).Attributes.HasFlag(FileAttributes.ReparsePoint)))
    throw new InvalidOperationException("Owner browser tests only accept a fresh disposable directory.");
var prepare = args[0] == "--prepare" || ownerBrowser;
if (prepare && ((!ownerBrowser && args.Length != 3) || File.Exists(path))) throw new InvalidOperationException("Refusing to overwrite an existing database.");
if (!prepare && !File.Exists(path)) throw new InvalidOperationException("Isolated database is missing.");
var key = Environment.GetEnvironmentVariable("Privacy__EncryptionKey") ?? throw new InvalidOperationException("A private isolated encryption key is required.");
await using var db = new BurgerHouseDbContext(new DbContextOptionsBuilder<BurgerHouseDbContext>()
    .UseSqlite(new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder { DataSource = path, Mode = prepare ? Microsoft.Data.Sqlite.SqliteOpenMode.ReadWriteCreate : Microsoft.Data.Sqlite.SqliteOpenMode.ReadOnly }.ToString()).Options,
    new AesGcmPersonalDataProtector(key));
if (prepare)
{
    // Migrations are permitted ONLY in this new isolated fixture database.
    await db.Database.MigrateAsync();
    if (ownerBrowser)
    {
        // Keep a curated public identity so the Browser can verify Owner changes in the storefront.
        var product = await db.Products.SingleAsync(p => p.Code == "burger-praiano");
        product.UpdateDetails("Burger do teste Owner", "Descrição sintética para o teste descartável");
        await db.SaveChangesAsync();
        var order = new Order(5, "delivery", "Cliente Sintético", "11999990000", "fixture@example.invalid",
            "52998224725", "38400-000", "Rua Teste", "10", "Centro", "Uberlândia");
        order.AddItem(new OrderItem(product.Id, 1, product.Price, saleCategory: product.Category));
        db.Orders.Add(order);
        await db.SaveChangesAsync();
        var payment = new Payment(order.Id, order.Total, Guid.NewGuid().ToString(), PaymentMethod.Pix);
        payment.Approve();
        order.MarkAsReceived();
        db.Payments.Add(payment);
        await db.SaveChangesAsync();

        var completed = new Order(0, "pickup", "Cliente de Faturamento", "11999990000", "finance-fixture@example.invalid", "11144477735");
        foreach (var category in new[] { "sides", "drinks" })
        {
            var extra = await db.Products.Where(p => p.Category == category).OrderBy(p => p.Id).FirstAsync();
            completed.AddItem(new OrderItem(extra.Id, 1, extra.Price, saleCategory: extra.Category));
        }
        completed.MarkAsReceived();
        completed.AdvanceStatus(OrderStatus.Preparing);
        completed.AdvanceStatus(OrderStatus.ReadyForPickup);
        completed.AdvanceStatus(OrderStatus.Completed);
        db.Orders.Add(completed);
        await db.SaveChangesAsync();
        var completedPayment = new Payment(completed.Id, completed.Total, Guid.NewGuid().ToString(), PaymentMethod.Pix);
        completedPayment.Approve();
        db.Payments.Add(completedPayment);
        await db.SaveChangesAsync();
        if (ownerDashboard)
        {
            var timed = new Order(0, "pickup", "Cliente de tempo", "11999990000",
                "timing@example.invalid", "11144477735");
            timed.AddItem(new OrderItem(product.Id, 1, product.Price, saleCategory: product.Category));
            timed.MarkAsReceived();
            db.Add(timed);
            db.Entry(timed).Property(o => o.CreatedAt).CurrentValue = DateTime.UtcNow.AddMinutes(-224);
            await db.SaveChangesAsync();
            var timedPayment = new Payment(timed.Id, timed.Total, Guid.NewGuid().ToString(), PaymentMethod.Pix);
            timedPayment.Approve(DateTime.UtcNow.AddMinutes(-224));
            db.Add(timedPayment);
            if (Environment.GetEnvironmentVariable("OWNER_DASHBOARD_MANY_ORDERS") == "1")
            {
                for (var index = 0; index < 20; index++)
                {
                    var pending = new Order(0, "pickup", $"Cliente de volume {index + 1}", "11999990000",
                        "volume@example.invalid", "11144477735");
                    pending.AddItem(new OrderItem(product.Id, 1, product.Price, saleCategory: product.Category));
                    db.Add(pending);
                    db.Entry(pending).Property(o => o.CreatedAt).CurrentValue =
                        DateTime.UtcNow.AddHours(-3).AddSeconds(-index);
                }
            }
            var localToday = BurgerHouse.Application.Admin.DateRange.LocalToday(DateTime.UtcNow);
            for (var day = 1; day < 28; day++)
            {
                for (var slot = 0; slot < day % 4; slot++)
                {
                    var movement = new Order(0, "pickup", "Cliente de teste", "11999990000",
                        "movement@example.invalid", "11144477735");
                    movement.AddItem(new OrderItem(product.Id, 1, product.Price, saleCategory: product.Category));
                    var hour = slot == 0 ? 12 + day % 4 : 17 + (day + slot) % 5;
                    var local = DateTime.SpecifyKind(localToday.AddDays(-day).AddHours(hour), DateTimeKind.Unspecified);
                    db.Add(movement);
                    db.Entry(movement).Property(o => o.CreatedAt).CurrentValue =
                        TimeZoneInfo.ConvertTimeToUtc(local, BurgerHouse.Application.Admin.DateRange.Zone);
                }
            }
            await db.SaveChangesAsync();
            // TBH_SCENARIO_SEED_V1
            // Synthetic orders only in the disposable Owner fixture.
            var scenario = Environment.GetEnvironmentVariable("OWNER_DASHBOARD_SCENARIO");

            if (!string.IsNullOrWhiteSpace(scenario))
            {
                var target = scenario.ToLowerInvariant() switch
                {
                    "low" => 15,
                    "normal" => 85,
                    "peak" => 250,
                    _ => throw new InvalidOperationException(
                        "Invalid Owner dashboard scenario.")
                };

                var zone = BurgerHouse.Application.Admin.DateRange.Zone;
                var localNow = TimeZoneInfo.ConvertTimeFromUtc(
                    DateTime.UtcNow, zone);
                var today = localNow.Date;

                var existingDates = await db.Orders
                    .AsNoTracking()
                    .Select(o => o.CreatedAt)
                    .ToListAsync();

                var alreadyToday = existingDates.Count(date =>
                    TimeZoneInfo.ConvertTimeFromUtc(
                        DateTime.SpecifyKind(date, DateTimeKind.Utc),
                        zone).Date == today);

                var remaining = target - alreadyToday;

                if (remaining < 0)
                    throw new InvalidOperationException(
                        "Fixture already exceeds scenario target.");

                var products = await db.Products
                    .Where(p => p.Id == product.Id
                        || p.Category == "sides"
                        || p.Category == "drinks")
                    .OrderBy(p => p.Id)
                    .ToListAsync();

                foreach (var category in new[]
                    { "sides", "drinks" })
                {
                    if (!products.Any(p => p.Category == category))
                        throw new InvalidOperationException(
                            "Missing fixture category: " + category);
                }

                var elapsedMinutes = Math.Max(
                    1, (int)(localNow - today).TotalMinutes);

                for (var index = 0; index < remaining; index++)
                {
                    var selectedProduct =
                        products[index % products.Count];

                    var orderForScenario = new Order(
                        0,
                        "pickup",
                        $"Cliente Simulado {index + 1}",
                        "11999990000",
                        "scenario@example.invalid",
                        "11144477735"
                    );

                    var quantity = 1 + (index % 3);

                    orderForScenario.AddItem(new OrderItem(
                        selectedProduct.Id,
                        quantity,
                        selectedProduct.Price,
                        saleCategory: selectedProduct.Category
                    ));

                    db.Orders.Add(orderForScenario);

                    var localDate = DateTime.SpecifyKind(
                        today.AddMinutes(
                            (index * 73) % elapsedMinutes),
                        DateTimeKind.Unspecified
                    );

                    var createdUtc =
                        TimeZoneInfo.ConvertTimeToUtc(localDate, zone);

                    db.Entry(orderForScenario)
                        .Property(o => o.CreatedAt)
                        .CurrentValue = createdUtc;

                    await db.SaveChangesAsync();

                    // One in five orders remains unpaid.
                    if (index % 5 != 0)
                    {
                        var syntheticPayment = new Payment(
                            orderForScenario.Id,
                            orderForScenario.Total,
                            Guid.NewGuid().ToString(),
                            PaymentMethod.Pix
                        );

                        syntheticPayment.Approve(createdUtc);
                        orderForScenario.MarkAsReceived();

                        switch (index % 4)
                        {
                            case 1:
                                orderForScenario.AdvanceStatus(
                                    OrderStatus.Preparing);
                                break;

                            case 2:
                                orderForScenario.AdvanceStatus(
                                    OrderStatus.Preparing);
                                orderForScenario.AdvanceStatus(
                                    OrderStatus.ReadyForPickup);
                                break;

                            case 3:
                                orderForScenario.AdvanceStatus(
                                    OrderStatus.Preparing);
                                orderForScenario.AdvanceStatus(
                                    OrderStatus.ReadyForPickup);
                                orderForScenario.AdvanceStatus(
                                    OrderStatus.Completed);
                                break;
                        }

                        db.Payments.Add(syntheticPayment);
                        await db.SaveChangesAsync();
                    }
                }

                var finalDates = await db.Orders
                    .AsNoTracking()
                    .Select(o => o.CreatedAt)
                    .ToListAsync();

                var finalToday = finalDates.Count(date =>
                    TimeZoneInfo.ConvertTimeFromUtc(
                        DateTime.SpecifyKind(date, DateTimeKind.Utc),
                        zone).Date == today);

                if (finalToday != target)
                    throw new InvalidOperationException(
                        $"Scenario count mismatch: {finalToday} != {target}");

                Console.WriteLine(
                    $"Owner scenario {scenario}: {finalToday} orders today.");
            }
        }
        await ProvisionOwnerAndCertificate(createCertificate: !ownerDashboard);
        // Keep the notification scenario focused on the original operational order.
        db.Add(new OwnerNotificationState
        {
            OwnerId = await db.Set<AdminUser>().Select(admin => admin.Id).SingleAsync(),
            OrderId = completed.Id,
            Archived = true
        });
        await db.SaveChangesAsync();
        Console.WriteLine(JsonSerializer.Serialize(new { orderId = order.Id, productId = product.Id }));
        return;
    }
    using var snapshot = JsonDocument.Parse(await File.ReadAllTextAsync(args[2]));
    var definitiveCodes = snapshot.RootElement.EnumerateArray().Select(item => item.GetProperty("code").GetString()!).ToHashSet(StringComparer.Ordinal);
    if (definitiveCodes.Count != 15 || snapshot.RootElement.GetArrayLength() != 15)
        throw new InvalidOperationException("The reviewed 15-product fixture snapshot is required.");
    // This branch only runs in a newly created isolated database. Remove legacy
    // seed rows before importing the definitive snapshot; never touch history.
    db.Products.RemoveRange(await db.Products.Where(p => !definitiveCodes.Contains(p.Code)).ToListAsync());
    await db.SaveChangesAsync();
    foreach (var item in snapshot.RootElement.EnumerateArray())
    {
        var code = item.GetProperty("code").GetString()!;
        var product = await db.Products.SingleOrDefaultAsync(p => p.Code == code);
        if (product is null) { product = new Product(code, item.GetProperty("name").GetString()!, item.GetProperty("price").GetDecimal()); db.Products.Add(product); }
        product.UpdateDetails(item.GetProperty("name").GetString()!, item.GetProperty("description").GetString()!);
        product.UpdatePrice(item.GetProperty("price").GetDecimal());
        product.UpdateClassification(item.GetProperty("category").GetString()!, item.GetProperty("displayOrder").GetInt32());
        product.UpdateEnglishDetails(item.TryGetProperty("englishName", out var en) ? en.GetString() : null, item.TryGetProperty("englishDescription", out var ed) ? ed.GetString() : null);
        if (item.GetProperty("isActive").GetBoolean()) product.Activate(); else product.Deactivate();
    }
    await db.SaveChangesAsync();
    await ProvisionOwnerAndCertificate();
}

var expectedMigrations = db.Database.GetMigrations().ToArray();
var appliedMigrations = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
if (!expectedMigrations.SequenceEqual(appliedMigrations, StringComparer.Ordinal))
{
    Console.WriteLine(JsonSerializer.Serialize(new {
        environment = "Homologation", provider = "SQLite", compatible = false,
        expectedMigrations, appliedMigrations,
        pendingMigrations = expectedMigrations.Except(appliedMigrations).ToArray(),
        unexpectedMigrations = appliedMigrations.Except(expectedMigrations).ToArray()
    }));
    Environment.ExitCode = 1;
    return;
}

async Task ProvisionOwnerAndCertificate(bool createCertificate = true)
{
    var password = Environment.GetEnvironmentVariable("HOMOLOGATION_OWNER_PASSWORD") ?? throw new InvalidOperationException("Private test Owner password is required.");
    await new AdminIdentity(db).CreateFirstOwnerAsync("owner.homologation@example.invalid", password, CancellationToken.None);
    if (!createCertificate) return;
    using var rsa = RSA.Create(2048);
    var certificateRequest = new CertificateRequest("CN=localhost", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    var names = new SubjectAlternativeNameBuilder(); names.AddDnsName("localhost"); names.AddIpAddress(System.Net.IPAddress.Loopback);
    certificateRequest.CertificateExtensions.Add(names.Build());
    certificateRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
    using var certificate = certificateRequest.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddDays(7));
    await File.WriteAllTextAsync(Path.Combine(root, "localhost.crt"), certificate.ExportCertificatePem());
    await File.WriteAllTextAsync(Path.Combine(root, "localhost.key"), rsa.ExportPkcs8PrivateKeyPem());
}
await db.Database.OpenConnectionAsync();
await using var integrity = db.Database.GetDbConnection().CreateCommand();
integrity.CommandText = "PRAGMA integrity_check";
var integrityResult = (string?)await integrity.ExecuteScalarAsync();
await using var foreign = db.Database.GetDbConnection().CreateCommand(); foreign.CommandText = "PRAGMA foreign_key_check";
await using var reader = await foreign.ExecuteReaderAsync(); var foreignFailures = 0; while (await reader.ReadAsync()) foreignFailures++;
await reader.DisposeAsync();
var orders = await db.Orders.Include(o => o.Items).AsNoTracking().ToListAsync();
var payments = await db.Payments.AsNoTracking().ToListAsync();
var orderEvidence = orders.Select(o => new { o.Id, o.OrderType, status = o.Status.ToString(), o.Subtotal, o.DeliveryFee, o.Total,
    items = o.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.Total }).ToArray() }).ToArray();
var paymentEvidence = payments.Select(p => new { p.Id, p.OrderId, p.Amount, status = p.Status.ToString(),
    hasExternalCheckout = !string.IsNullOrWhiteSpace(p.ExternalCheckoutId), hasExternalPayment = !string.IsNullOrWhiteSpace(p.ExternalPaymentId) }).ToArray();
var amountMismatches = payments.Count(p => orders.All(o => o.Id != p.OrderId || o.Total != p.Amount));
var result = new { environment = "Homologation", productionTouched = false, integrity = integrityResult, foreignKeyFailures = foreignFailures,
    provider = "SQLite", compatible = true, expectedMigrations, appliedMigrations,
    products = await db.Products.CountAsync(), owners = await db.Set<AdminUser>().CountAsync(), orders = await db.Orders.CountAsync(),
    orderItems = await db.OrderItems.CountAsync(), payments = await db.Payments.CountAsync(), auditLogs = await db.AdminAuditLogs.CountAsync(),
    migrations = (await db.Database.GetAppliedMigrationsAsync()).Count(), pendingMigrations = (await db.Database.GetPendingMigrationsAsync()).ToArray(),
    amountMismatches, orderEvidence, paymentEvidence,
    auditActions = await db.AdminAuditLogs.AsNoTracking().Select(a => a.Action).ToArrayAsync() };
Console.WriteLine(JsonSerializer.Serialize(result));
if (integrityResult != "ok" || foreignFailures != 0 || amountMismatches != 0) Environment.ExitCode = 1;
