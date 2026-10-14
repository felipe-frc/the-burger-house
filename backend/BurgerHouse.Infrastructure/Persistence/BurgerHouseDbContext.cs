using BurgerHouse.Domain.Entities;
using BurgerHouse.Application.Abstractions.Persistence;
using BurgerHouse.Infrastructure.Privacy;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Persistence;

public class BurgerHouseDbContext : DbContext
{
    public BurgerHouseDbContext(
        DbContextOptions<BurgerHouseDbContext> options,
        IPersonalDataProtector personalDataProtector)
        : base(options)
    {
        PersonalDataProtector = personalDataProtector ?? throw new ArgumentNullException(nameof(personalDataProtector));
    }

    internal IPersonalDataProtector PersonalDataProtector { get; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) =>
        optionsBuilder.ReplaceService<IModelCacheKeyFactory, PersonalDataModelCacheKeyFactory>();

    private ValueConverter<string, string> PersonalDataConverter(string purpose)
    {
        var protector = PersonalDataProtector;
        return new(value => protector.Protect(value, purpose)!, value => protector.Unprotect(value, purpose)!);
    }

    public DbSet<Product> Products => Set<Product>();

    public DbSet<Order> Orders => Set<Order>();

    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentRefund> PaymentRefunds => Set<PaymentRefund>();

    public DbSet<AdminAuditLog> AdminAuditLogs => Set<AdminAuditLog>();

    protected override void OnModelCreating(
        ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.Entity<PaymentRefund>(entity =>
        {
            entity.ToTable("PaymentRefunds", table =>
                table.HasCheckConstraint("CK_PaymentRefunds_PositiveAmount",
                    "CAST(Amount AS NUMERIC) > 0 AND CAST(CumulativeRefundedAmount AS NUMERIC) >= CAST(Amount AS NUMERIC)"));
            entity.Property(r => r.Amount).HasPrecision(10, 2);
            entity.Property(r => r.CumulativeRefundedAmount).HasPrecision(10, 2);
            entity.HasIndex(r => new { r.PaymentId, r.CumulativeRefundedAmount }).IsUnique();
            entity.HasIndex(r => r.CreatedAt);
        });

        modelBuilder.Entity<AdminAuditLog>(entity =>
        {
            entity.ToTable("AdminAuditLogs");

            entity.HasKey(log => log.Id);

            entity.Property(log => log.ActorType)
                .IsRequired()
                .HasMaxLength(40);

            entity.Property(log => log.Action)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(log => log.EntityType)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(log => log.EntityId)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(log => log.Changes)
                .IsRequired()
                .HasColumnType("TEXT");

            entity.Property(log => log.CreatedAtUtc)
                .IsRequired();

            entity.HasIndex(log => log.CreatedAtUtc);

            entity.HasIndex(log => new
            {
                log.EntityType,
                log.EntityId,
                log.CreatedAtUtc
            });

            entity.HasOne<AdminUser>()
                .WithMany()
                .HasForeignKey(log => log.AdminUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AdminUser>(entity =>
        {
            entity.Property(u => u.Email).HasMaxLength(254);
            entity.HasIndex(u => u.Email).IsUnique();
            entity.Property(u => u.PasswordHash).HasMaxLength(512);
        });
        modelBuilder.Entity<AdminSession>(entity =>
        {
            entity.Property(s => s.Id).HasMaxLength(64);
            entity.HasIndex(s => s.ExpiresAt);
            entity.HasOne<AdminUser>().WithMany().HasForeignKey(s => s.AdminUserId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<Product>().Property(p => p.CostPrice).HasPrecision(10, 2);
        modelBuilder.Entity<Product>().Property(p => p.EnglishName)
            .HasMaxLength(150)
            .HasDefaultValue(string.Empty);
        modelBuilder.Entity<Product>().Property(p => p.EnglishDescription)
            .HasMaxLength(500)
            .HasDefaultValue(string.Empty);
        modelBuilder.Entity<OrderItem>().Property(i => i.UnitCost).HasPrecision(10, 2);
        modelBuilder.Entity<Order>().Property(o => o.Status).IsConcurrencyToken();
        modelBuilder.Entity<Order>().HasIndex(o => new { o.Status, o.CreatedAt });
        modelBuilder.Entity<Payment>().HasIndex(p => new { p.Status, p.UpdatedAt });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.ToTable("Products");

            entity.HasKey(product => product.Id);
            entity.Property(product => product.Category).IsRequired().HasMaxLength(10).HasDefaultValue("menu");
            entity.Property(product => product.DisplayOrder).HasDefaultValue(1000).HasSentinel(-1);

            entity.Property(product => product.Code)
                .IsRequired()
                .HasMaxLength(100);

            entity.HasIndex(product => product.Code)
                .IsUnique();

            entity.Property(product => product.Name)
                .IsRequired()
                .HasMaxLength(150);

            entity.Property(product => product.Description)
                .IsRequired()
                .HasMaxLength(500);

            entity.Property(product => product.Price)
                .HasPrecision(10, 2);

            entity.Property(product => product.IsActive)
                .IsRequired();

            entity.HasData(
                new
                {
                    Id = 1,
                    Category = "menu",
                    DisplayOrder = 1,
                    Code = "burger-praiano",
                    Name = "O Praiano",
                    Description = "Queijo coalho grelhado com fio de mel, banana-da-terra frita, bacon crocante e maionese defumada.",
                    Price = 43.90m,
                    IsActive = true
                },
                new
                {
                    Id = 2,
                    Category = "menu",
                    DisplayOrder = 2,
                    Code = "burger-onion-rings",
                    Name = "O Famoso Onion Ring",
                    Description = "Aioli de alho assado, queijo suíço derretido, bacon e anéis de cebola gigantes crocantes.",
                    Price = 43.90m,
                    IsActive = true
                },
                new
                {
                    Id = 3,
                    Category = "menu",
                    DisplayOrder = 3,
                    Code = "burger-crispy-chicken-cheddar",
                    Name = "Crispy Chicken Cheddar",
                    Description = "Filé de frango crocante com cheddar derretido, bacon, alface, tomate e maionese defumada.",
                    Price = 35.90m,
                    IsActive = true
                },
                new
                {
                    Id = 4,
                    Category = "menu",
                    DisplayOrder = 4,
                    Code = "burger-outback-king",
                    Name = "O Outback King",
                    Description = "Creme de cheddar artesanal, cebola caramelizada, cubos de bacon crocante e molho barbecue especial.",
                    Price = 43.90m,
                    IsActive = true
                },
                new
                {
                    Id = 5,
                    Category = "menu",
                    DisplayOrder = 5,
                    Code = "burger-chicken-grill-supreme",
                    Name = "Chicken Grill Supreme",
                    Description = "Filé de frango grelhado com cheddar, bacon, alface, tomate, cebola crispy e maionese defumada.",
                    Price = 35.90m,
                    IsActive = true
                },
                new
                {
                    Id = 6,
                    Category = "menu",
                    DisplayOrder = 6,
                    Code = "burger-joia-da-coroa",
                    Name = "A Joia da Coroa",
                    Description = "Burger de picanha premium com queijo Canastra Real, cogumelos salteados e aioli de trufas brancas.",
                    Price = 58.90m,
                    IsActive = true
                },
                new
                {
                    Id = 7,
                    Category = "sides",
                    DisplayOrder = 1,
                    Code = "side-fritas-cheddar",
                    Name = "Fritas Cheddar & Bacon",
                    Description = "Batatas fritas crocantes mergulhadas em creme de cheddar artesanal com cubos de bacon crocante.",
                    Price = 24.90m,
                    IsActive = true
                },
                new
                {
                    Id = 8,
                    Category = "sides",
                    DisplayOrder = 2,
                    Code = "side-batata-rustica",
                    Name = "Batatas Rústicas da Casa",
                    Description = "Cortes grossos com casca, fritos até ficarem crocantes, temperados com sal grosso e alecrim.",
                    Price = 18.90m,
                    IsActive = true
                },
                new
                {
                    Id = 9,
                    Category = "sides",
                    DisplayOrder = 3,
                    Code = "side-aneis-cebola",
                    Name = "Anéis de Cebola Crocantes",
                    Description = "Anéis de cebola empanados em mistura secreta e fritos à perfeição com molho barbecue especial.",
                    Price = 22.90m,
                    IsActive = true
                },
                new
                {
                    Id = 10,
                    Category = "drinks",
                    DisplayOrder = 1,
                    Code = "drink-coca-lata",
                    Name = "Coca-Cola Lata",
                    Description = "Refrigerante gelado e refrescante para complementar sua refeição.",
                    Price = 5.90m,
                    IsActive = true
                },
                new
                {
                    Id = 11,
                    Category = "drinks",
                    DisplayOrder = 2,
                    Code = "drink-guarana-antarctica",
                    Name = "Guaraná Antarctica",
                    Description = "Refrigerante com sabor único e refrescante para sua satisfação.",
                    Price = 5.90m,
                    IsActive = true
                }
            );
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.ToTable("Orders");

            entity.HasKey(order => order.Id);

            entity.Property(order => order.OrderType).HasMaxLength(10).IsRequired();
            entity.Property(order => order.CustomerName).HasMaxLength(120).IsRequired();
            entity.Property(order => order.CustomerPhone).IsRequired();

            entity.Property(order => order.CustomerEmail)
                .HasColumnType("TEXT");

            entity.Property(order => order.CustomerTaxId)
                .HasColumnType("TEXT");

            // Domain limits still apply to plaintext. SQLite stores the larger envelopes as TEXT.
            // CustomerName remains queryable for the existing Admin substring search.
            foreach (var field in new[] { nameof(Order.CustomerPhone), nameof(Order.CustomerEmail),
                nameof(Order.CustomerTaxId), nameof(Order.ZipCode), nameof(Order.Street), nameof(Order.HouseNumber),
                nameof(Order.Neighborhood), nameof(Order.City), nameof(Order.Complement), nameof(Order.Observation) })
                entity.Property<string>(field).HasColumnType("TEXT").HasConversion(PersonalDataConverter($"Orders.{field}"));

            entity.Property(order => order.DeliveryFee)
                .HasPrecision(10, 2);

            entity.Property(order => order.Status)
                .IsRequired();

            entity.Property(order => order.CreatedAt)
                .IsRequired();

            entity.Ignore(order => order.Subtotal);

            entity.Ignore(order => order.Total);

            entity.HasMany(order => order.Items)
                .WithOne()
                .HasForeignKey("OrderId")
                .IsRequired()
                .OnDelete(DeleteBehavior.Cascade);

            entity.Navigation(order => order.Items)
                .UsePropertyAccessMode(
                    PropertyAccessMode.Field
                );
        });

        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.ToTable("OrderItems");

            entity.HasKey(item => item.Id);

            entity.Property(item => item.ProductId)
                .IsRequired();

            entity.Property(item => item.Quantity)
                .IsRequired();

            entity.Property(item => item.UnitPrice)
                .HasPrecision(10, 2);

            entity.Property(item => item.Observation)
                .HasColumnType("TEXT").HasConversion((ValueConverter)PersonalDataConverter("OrderItems.Observation"));

            entity.Ignore(item => item.Total);

            entity.HasOne<Product>()
                .WithMany()
                .HasForeignKey(item => item.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            // Avoid rebuilding this legacy SQLite table: it contains historical columns
            // outside the current EF model. Refund bounds are enforced by the domain.
            entity.ToTable("Payments");
            entity.Property(p => p.RefundedAmount).HasPrecision(10, 2).HasDefaultValue(0m).IsConcurrencyToken();
            entity.Property(p => p.ApprovalDateSource).HasDefaultValue(BurgerHouse.Domain.Enums.ApprovalDateSource.Unknown);
            entity.Property(p => p.ApprovedAt).IsConcurrencyToken();
            entity.Property(p => p.RefundTrackingStartedAt).IsConcurrencyToken();
            entity.Property(p => p.Status).IsConcurrencyToken();
            entity.HasIndex(p => p.ApprovedAt);
            entity.HasMany(p => p.Refunds).WithOne().HasForeignKey(r => r.PaymentId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Navigation(p => p.Refunds).UsePropertyAccessMode(PropertyAccessMode.Field);

            entity.HasKey(payment => payment.Id);

            entity.Property(payment => payment.OrderId)
                .IsRequired();

            entity.HasIndex(payment => payment.OrderId)
                .IsUnique()
                .HasFilter("\"Status\" IN (1, 2)");

            entity.Property(payment => payment.Amount)
                .HasPrecision(10, 2);

            entity.Property(payment => payment.Status)
                .IsRequired();

            entity.Property(payment => payment.Method)
                .IsRequired();

            entity.Property(payment => payment.IdempotencyKey)
                .IsRequired()
                .HasMaxLength(36);

            entity.HasIndex(payment => payment.IdempotencyKey)
                .IsUnique();

            entity.Property(payment => payment.ExternalPaymentId)
                .HasMaxLength(100);

            entity.Property(payment => payment.ExternalCheckoutId)
                .HasMaxLength(100);

            entity.HasIndex(payment => payment.ExternalCheckoutId)
                .IsUnique();

            entity.HasIndex(payment => payment.ExternalPaymentId)
                .IsUnique();

            entity.Property(payment => payment.CreatedAt)
                .IsRequired();

            entity.HasOne<Order>()
                .WithMany()
                .HasForeignKey(payment => payment.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
