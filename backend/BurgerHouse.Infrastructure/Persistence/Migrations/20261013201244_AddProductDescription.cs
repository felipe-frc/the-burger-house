using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BurgerHouse.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProductDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Products",
                type: "TEXT",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 1,
                column: "Description",
                value: "Queijo coalho grelhado com fio de mel, banana-da-terra frita, bacon crocante e maionese defumada.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 2,
                column: "Description",
                value: "Aioli de alho assado, queijo suíço derretido, bacon e anéis de cebola gigantes crocantes.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 3,
                column: "Description",
                value: "Filé de frango crocante com cheddar derretido, bacon, alface, tomate e maionese defumada.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 4,
                column: "Description",
                value: "Creme de cheddar artesanal, cebola caramelizada, cubos de bacon crocante e molho barbecue especial.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 5,
                column: "Description",
                value: "Filé de frango grelhado com cheddar, bacon, alface, tomate, cebola crispy e maionese defumada.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 6,
                column: "Description",
                value: "Burger de picanha premium com queijo Canastra Real, cogumelos salteados e aioli de trufas brancas.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 7,
                column: "Description",
                value: "Batatas fritas crocantes mergulhadas em creme de cheddar artesanal com cubos de bacon crocante.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 8,
                column: "Description",
                value: "Cortes grossos com casca, fritos até ficarem crocantes, temperados com sal grosso e alecrim.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 9,
                column: "Description",
                value: "Anéis de cebola empanados em mistura secreta e fritos à perfeição com molho barbecue especial.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 10,
                column: "Description",
                value: "Refrigerante gelado e refrescante para complementar sua refeição.");

            migrationBuilder.UpdateData(
                table: "Products",
                keyColumn: "Id",
                keyValue: 11,
                column: "Description",
                value: "Refrigerante com sabor único e refrescante para sua satisfação.");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Description",
                table: "Products");
        }
    }
}
