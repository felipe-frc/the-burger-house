using BurgerHouse.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BurgerHouse.Infrastructure.Admin;

public sealed class AgendaEventConfiguration : IEntityTypeConfiguration<AdminAgendaEvent>
{
    public void Configure(EntityTypeBuilder<AdminAgendaEvent> builder)
    {
        builder.ToTable("AdminAgendaEvents");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).HasMaxLength(100);
        builder.Property(e => e.Title).HasMaxLength(200);
        builder.Property(e => e.Description).HasMaxLength(2000);
        builder.Property(e => e.Notes).HasMaxLength(2000);
        builder.Property(e => e.Revision).IsConcurrencyToken();
        builder.HasIndex(e => new { e.Date, e.Deleted });
    }
}
