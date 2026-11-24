using BurgerHouse.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BurgerHouse.Infrastructure.Privacy;

// Optional bounded module, same database/connection. Never migrates on API startup.
// Its own migration history leaves the existing operational schema contract untouched.
public sealed class PrivacyDbContext(DbContextOptions<PrivacyDbContext> options) : DbContext(options)
{
    public DbSet<PrivacyRequest> Requests => Set<PrivacyRequest>();
    public DbSet<PrivacyDecision> Decisions => Set<PrivacyDecision>();
    protected override void OnModelCreating(ModelBuilder model) => Configure(model);
    internal static void Configure(ModelBuilder model)
    {
        model.HasAnnotation("Relational:MaxIdentifierLength", 63);
        var request = model.Entity<PrivacyRequest>();
        request.ToTable("PrivacyRequests");
        request.HasKey(x => x.Id);
        request.Property(x => x.Id).ValueGeneratedNever().HasColumnType("uuid");
        request.Property(x => x.OrderId).HasColumnType("integer");
        request.Property(x => x.Revision).HasColumnType("bigint").IsConcurrencyToken();
        request.Property(x => x.Kind).IsRequired().HasColumnType("character varying(24)").HasMaxLength(24);
        request.Property(x => x.State).IsRequired().HasColumnType("character varying(24)").HasMaxLength(24);
        request.Property(x => x.Decision).HasColumnType("character varying(32)").HasMaxLength(32);
        request.Property(x => x.EncryptedCorrection).HasColumnType("character varying(4096)").HasMaxLength(4096);
        request.Property(x => x.CreatedAt).HasColumnType("timestamp with time zone");
        request.Property(x => x.ReviewedAt).HasColumnType("timestamp with time zone");
        request.Property(x => x.ReviewedBy).HasColumnType("integer");
        request.HasIndex(x => new { x.State, x.CreatedAt });
        request.HasIndex(x => new { x.OrderId, x.CreatedAt });
        model.Entity<PrivacyOrderReference>().ToTable("Orders", table => table.ExcludeFromMigrations());
        model.Entity<PrivacyOrderReference>().HasKey(x => x.Id);
        model.Entity<PrivacyOrderReference>().Property(x => x.Id).ValueGeneratedNever().HasColumnType("integer");
        request.HasOne<PrivacyOrderReference>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
        var decision = model.Entity<PrivacyDecision>();
        decision.ToTable("PrivacyDecisions"); decision.HasKey(x => x.Id);
        decision.Property(x => x.Id).ValueGeneratedNever().HasColumnType("uuid");
        decision.Property(x => x.RequestId).HasColumnType("uuid");
        decision.Property(x => x.OwnerId).HasColumnType("integer");
        decision.Property(x => x.Action).IsRequired().HasMaxLength(32).HasColumnType("character varying(32)");
        decision.Property(x => x.CreatedAt).HasColumnType("timestamp with time zone");
        decision.Property(x => x.Revision).HasColumnType("bigint");
        decision.HasIndex(x => new { x.RequestId, x.CreatedAt });
        decision.HasOne<PrivacyRequest>().WithMany().HasForeignKey(x => x.RequestId).OnDelete(DeleteBehavior.Restrict);
    }
}
public sealed class PrivacyOrderReference { public int Id { get; set; } }
public sealed class PrivacyDecision
{
    public Guid Id { get; set; }
    public Guid RequestId { get; set; }
    public int OwnerId { get; set; }
    public string Action { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public long Revision { get; set; }
}
public sealed class PrivacyRequest
{
    public Guid Id { get; set; }
    public int OrderId { get; set; }
    public string Kind { get; set; } = "";
    public string State { get; set; } = "Received";
    public string? EncryptedCorrection { get; set; }
    public string? Decision { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public int? ReviewedBy { get; set; }
    public long Revision { get; set; }
}

[DbContext(typeof(PrivacyDbContext)), Migration("20261122000100_AddPrivacyRequests")]
public sealed class AddPrivacyRequests : Migration
{
    protected override void Up(MigrationBuilder migration)
    {
        migration.CreateTable("PrivacyRequests", columns: table => new {
            Id = table.Column<Guid>(nullable: false), OrderId = table.Column<int>(nullable: false),
            Kind = table.Column<string>(maxLength: 24, nullable: false), State = table.Column<string>(maxLength: 24, nullable: false),
            EncryptedCorrection = table.Column<string>(maxLength: 4096, nullable: true),
            Decision = table.Column<string>(maxLength: 32, nullable: true),
            CreatedAt = table.Column<DateTime>(nullable: false), ReviewedAt = table.Column<DateTime>(nullable: true),
            ReviewedBy = table.Column<int>(nullable: true), Revision = table.Column<long>(nullable: false),
        }, constraints: table => {
            table.PrimaryKey("PK_PrivacyRequests", x => x.Id);
            table.ForeignKey("FK_PrivacyRequests_Orders_OrderId", x => x.OrderId, "Orders", "Id", onDelete: ReferentialAction.Restrict);
        });
        migration.CreateIndex("IX_PrivacyRequests_State_CreatedAt", "PrivacyRequests", new[] { "State", "CreatedAt" });
        migration.CreateIndex("IX_PrivacyRequests_OrderId_CreatedAt", "PrivacyRequests", new[] { "OrderId", "CreatedAt" });
        migration.CreateTable("PrivacyDecisions", columns: table => new {
            Id = table.Column<Guid>(nullable: false), RequestId = table.Column<Guid>(nullable: false),
            OwnerId = table.Column<int>(nullable: false), Action = table.Column<string>(maxLength: 32, nullable: false),
            CreatedAt = table.Column<DateTime>(nullable: false), Revision = table.Column<long>(nullable: false),
        }, constraints: table => {
            table.PrimaryKey("PK_PrivacyDecisions", x => x.Id);
            table.ForeignKey("FK_PrivacyDecisions_PrivacyRequests_RequestId", x => x.RequestId, "PrivacyRequests", "Id", onDelete: ReferentialAction.Restrict);
        });
        migration.CreateIndex("IX_PrivacyDecisions_RequestId_CreatedAt", "PrivacyDecisions", new[] { "RequestId", "CreatedAt" });
    }
    protected override void Down(MigrationBuilder migration) => throw new NotSupportedException("Privacy records require an explicit retention review; no automatic rollback deletion.");
    protected override void BuildTargetModel(ModelBuilder model) => PrivacyDbContext.Configure(model);
}
[DbContext(typeof(PrivacyDbContext))]
public sealed class PrivacyDbContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder model) => PrivacyDbContext.Configure(model);
}
