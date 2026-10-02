using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BurgerHouse.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveMercadoPagoProvider : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Payments_ExternalPreferenceId",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Payments_Provider_ExternalCheckoutId",
                table: "Payments");

            // Native SQLite DROP COLUMN preserves the unrelated, unmapped historical ExternalOrderId column.
            migrationBuilder.Sql("ALTER TABLE Payments DROP COLUMN ExternalPreferenceId;");
            migrationBuilder.Sql("ALTER TABLE Payments DROP COLUMN Provider;");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_ExternalCheckoutId",
                table: "Payments",
                column: "ExternalCheckoutId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Payments_ExternalCheckoutId",
                table: "Payments");

            migrationBuilder.AddColumn<string>(
                name: "ExternalPreferenceId",
                table: "Payments",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Provider",
                table: "Payments",
                type: "INTEGER",
                nullable: false,
                defaultValue: 2);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_ExternalPreferenceId",
                table: "Payments",
                column: "ExternalPreferenceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_Provider_ExternalCheckoutId",
                table: "Payments",
                columns: new[] { "Provider", "ExternalCheckoutId" },
                unique: true);
        }
    }
}
