using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BurgerHouse.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentProviderAndPagBankCheckout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExternalCheckoutId",
                table: "Payments",
                type: "TEXT",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Provider",
                table: "Payments",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_Provider_ExternalCheckoutId",
                table: "Payments",
                columns: new[] { "Provider", "ExternalCheckoutId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Payments_Provider_ExternalCheckoutId",
                table: "Payments");

            // Native SQLite DROP COLUMN preserves the unrelated, unmapped historical ExternalOrderId column.
            migrationBuilder.Sql("ALTER TABLE Payments DROP COLUMN ExternalCheckoutId;");
            migrationBuilder.Sql("ALTER TABLE Payments DROP COLUMN Provider;");
        }
    }
}
