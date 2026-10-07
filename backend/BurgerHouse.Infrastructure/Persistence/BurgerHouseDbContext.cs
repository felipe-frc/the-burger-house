using BurgerHouse.Domain.Entities;

using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Persistence;

public class BurgerHouseDbContext : DbContext
{
    public BurgerHouseDbContext(
        DbContextOptions<BurgerHouseDbContext> options)
        : base(options)
    {
    }

    public DbSet<Product> Products => Set<Product>();

    public DbSet<Order> Orders => Set<Order>();

    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    public DbSet<Payment> Payments => Set<Payment>();

    protected override void OnModelCreating(
        ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

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
        modelBuilder.Entity<OrderItem>().Property(i => i.UnitCost).HasPrecision(10, 2);
        modelBuilder.Entity<Order>().Property(o => o.Status).IsConcurrencyToken();
        modelBuilder.Entity<Order>().HasIndex(o => new { o.Status, o.CreatedAt });
        modelBuilder.Entity<Payment>().HasIndex(p => new { p.Status, p.UpdatedAt });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.ToTable("Products");

            entity.HasKey(product => product.Id);

            entity.Property(product => product.Code)
                .IsRequired()
                .HasMaxLength(100);

            entity.HasIndex(product => product.Code)
                .IsUnique();

            entity.Property(product => product.Name)
                .IsRequired()
                .HasMaxLength(150);

            entity.Property(product => product.Price)
                .HasPrecision(10, 2);

            entity.Property(product => product.IsActive)
                .IsRequired();

            entity.HasData(
                new
                {
                    Id = 1,
                    Code = "burger-praiano",
                    Name = "O Praiano",
                    Price = 43.90m,
                    IsActive = true
                },
                new
                {
                    Id = 2,
                    Code = "burger-onion-rings",
                    Name = "O Famoso Onion Ring",
                    Price = 43.90m,
                    IsActive = true
                },
                new
                {
                    Id = 3,
                    Code = "burger-crispy-chicken-cheddar",
                    Name = "Crispy Chicken Cheddar",
                    Price = 35.90m,
                    IsActive = true
                },
                new
                {
                    Id = 4,
                    Code = "burger-outback-king",
                    Name = "O Outback King",
                    Price = 43.90m,
                    IsActive = true
                },
                new
                {
                    Id = 5,
                    Code = "burger-chicken-grill-supreme",
                    Name = "Chicken Grill Supreme",
                    Price = 35.90m,
                    IsActive = true
                },
                new
                {
                    Id = 6,
                    Code = "burger-joia-da-coroa",
                    Name = "A Joia da Coroa",
                    Price = 58.90m,
                    IsActive = true
                },
                new
                {
                    Id = 7,
                    Code = "side-fritas-cheddar",
                    Name = "Fritas Cheddar & Bacon",
                    Price = 24.90m,
                    IsActive = true
                },
                new
                {
                    Id = 8,
                    Code = "side-batata-rustica",
                    Name = "Batatas Rústicas da Casa",
                    Price = 18.90m,
                    IsActive = true
                },
                new
                {
                    Id = 9,
                    Code = "side-aneis-cebola",
                    Name = "Anéis de Cebola Crocantes",
                    Price = 22.90m,
                    IsActive = true
                },
                new
                {
                    Id = 10,
                    Code = "drink-coca-lata",
                    Name = "Coca-Cola Lata",
                    Price = 5.90m,
                    IsActive = true
                },
                new
                {
                    Id = 11,
                    Code = "drink-guarana-antarctica",
                    Name = "Guaraná Antarctica",
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
            entity.Property(order => order.CustomerPhone).HasMaxLength(25).IsRequired();
            entity.Property(order => order.ZipCode).HasMaxLength(10);
            entity.Property(order => order.Street).HasMaxLength(200);
            entity.Property(order => order.HouseNumber).HasMaxLength(20);
            entity.Property(order => order.Neighborhood).HasMaxLength(120);
            entity.Property(order => order.City).HasMaxLength(120);
            entity.Property(order => order.Complement).HasMaxLength(200);
            entity.Property(order => order.Observation).HasMaxLength(2000);

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
                .HasMaxLength(500);

            entity.Ignore(item => item.Total);

            entity.HasOne<Product>()
                .WithMany()
                .HasForeignKey(item => item.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.ToTable("Payments");

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
