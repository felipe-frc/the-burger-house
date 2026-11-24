using BurgerHouse.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BurgerHouse.Infrastructure.Persistence;

public sealed class StockConfiguration : IEntityTypeConfiguration<StockItem>
{
    public void Configure(EntityTypeBuilder<StockItem> entity)
    {
        entity.ToTable("StockItems", table => table.HasCheckConstraint("CK_Stock_Balance", "Quantity >= 0 AND Minimum >= 0"));
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Name).HasMaxLength(120);
        entity.Property(x => x.Unit).HasMaxLength(20);
        entity.Property(x => x.Quantity).HasConversion(value => (long)(value * 1000), value => value / 1000m);
        entity.Property(x => x.Minimum).HasConversion(value => (long)(value * 1000), value => value / 1000m);
        entity.Property(x => x.Revision).IsConcurrencyToken();
    }
}
public sealed class StockMovementConfiguration : IEntityTypeConfiguration<StockMovement>
{
    public void Configure(EntityTypeBuilder<StockMovement> entity)
    {
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Delta).HasConversion(value => (long)(value * 1000), value => value / 1000m);
        entity.Property(x => x.Balance).HasConversion(value => (long)(value * 1000), value => value / 1000m);
        entity.Property(x => x.Reason).HasMaxLength(300);
        entity.HasOne<StockItem>().WithMany().HasForeignKey(x => x.StockItemId).OnDelete(DeleteBehavior.Restrict);
        entity.HasIndex(x => new { x.StockItemId, x.CreatedAt });
    }
}
