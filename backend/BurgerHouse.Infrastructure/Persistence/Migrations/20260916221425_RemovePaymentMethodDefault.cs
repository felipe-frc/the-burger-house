using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BurgerHouse.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemovePaymentMethodDefault : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "Method",
                table: "Payments",
                type: "INTEGER",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "INTEGER",
                oldDefaultValue: 2);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "Method",
                table: "Payments",
                type: "INTEGER",
                nullable: false,
                defaultValue: 2,
                oldClrType: typeof(int),
                oldType: "INTEGER");
        }
    }
}
