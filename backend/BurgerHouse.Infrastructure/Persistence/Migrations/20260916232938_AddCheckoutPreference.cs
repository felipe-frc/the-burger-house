using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BurgerHouse.Infrastructure.Persistence.Migrations;

public partial class AddCheckoutPreference : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Historical ExternalOrderId data remains physically present until a separately approved cleanup.
        migrationBuilder.AddColumn<string>(
            name: "ExternalPreferenceId", table: "Payments", type: "TEXT", maxLength: 100, nullable: true);
        migrationBuilder.CreateIndex(
            name: "IX_Payments_ExternalPreferenceId", table: "Payments", column: "ExternalPreferenceId", unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_Payments_ExternalPreferenceId", table: "Payments");
        // Native SQLite DROP COLUMN preserves the unrelated, unmapped historical column.
        migrationBuilder.Sql("ALTER TABLE Payments DROP COLUMN ExternalPreferenceId;");
    }
}
