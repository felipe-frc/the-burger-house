using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace BurgerHouse.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SeedProducts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Products",
                columns: new[] { "Id", "Code", "IsActive", "Name", "Price" },
                values: new object[,]
                {
                    { 1, "burger-praiano", true, "O Praiano", 43.90m },
                    { 2, "burger-onion-rings", true, "O Famoso Onion Ring", 43.90m },
                    { 3, "burger-crispy-chicken-cheddar", true, "Crispy Chicken Cheddar", 35.90m },
                    { 4, "burger-outback-king", true, "O Outback King", 43.90m },
                    { 5, "burger-chicken-grill-supreme", true, "Chicken Grill Supreme", 35.90m },
                    { 6, "burger-joia-da-coroa", true, "A Joia da Coroa", 58.90m },
                    { 7, "side-fritas-cheddar", true, "Fritas Cheddar & Bacon", 24.90m },
                    { 8, "side-batata-rustica", true, "Batatas Rústicas da Casa", 18.90m },
                    { 9, "side-aneis-cebola", true, "Anéis de Cebola Crocantes", 22.90m },
                    { 10, "drink-coca-lata", true, "Coca-Cola Lata", 5.90m },
                    { 11, "drink-guarana-antarctica", true, "Guaraná Antarctica", 5.90m }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 1);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 2);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 3);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 4);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 5);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 6);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 7);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 8);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 9);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 10);

            migrationBuilder.DeleteData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 11);
        }
    }
}
