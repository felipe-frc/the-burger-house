using BurgerHouse.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace BurgerHouse.Infrastructure.Persistence;

public class BurgerHouseDbContext : DbContext
{
    public BurgerHouseDbContext(DbContextOptions<BurgerHouseDbContext> options)
        : base(options)
    {
    }

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Payment> Payments => Set<Payment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Order>(entity =>
        {
            entity.ToTable("Orders");

            entity.HasKey(order => order.Id);

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
                .UsePropertyAccessMode(PropertyAccessMode.Field);
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
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.ToTable("Payments");

            entity.HasKey(payment => payment.Id);

            entity.Property(payment => payment.OrderId)
                .IsRequired();

            entity.Property(payment => payment.Amount)
                .HasPrecision(10, 2);

            entity.Property(payment => payment.Status)
                .IsRequired();

            entity.Property(payment => payment.ExternalPaymentId)
                .HasMaxLength(100);

            entity.Property(payment => payment.CreatedAt)
                .IsRequired();

            entity.HasOne<Order>()
                .WithMany()
                .HasForeignKey(payment => payment.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}