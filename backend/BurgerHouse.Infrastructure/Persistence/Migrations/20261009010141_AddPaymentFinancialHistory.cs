using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BurgerHouse.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentFinancialHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ApprovalDateSource",
                table: "Payments",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "ApprovedAt",
                table: "Payments",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RefundTrackingStartedAt",
                table: "Payments",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RefundedAmount",
                table: "Payments",
                type: "TEXT",
                precision: 10,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "PaymentRefunds",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PaymentId = table.Column<int>(type: "INTEGER", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", precision: 10, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CumulativeRefundedAmount = table.Column<decimal>(type: "TEXT", precision: 10, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentRefunds", x => x.Id);
                    table.CheckConstraint("CK_PaymentRefunds_PositiveAmount", "CAST(Amount AS NUMERIC) > 0 AND CAST(CumulativeRefundedAmount AS NUMERIC) >= CAST(Amount AS NUMERIC)");
                    table.ForeignKey(
                        name: "FK_PaymentRefunds_Payments_PaymentId",
                        column: x => x.PaymentId,
                        principalTable: "Payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Payments_ApprovedAt",
                table: "Payments",
                column: "ApprovedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentRefunds_CreatedAt",
                table: "PaymentRefunds",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentRefunds_PaymentId_CumulativeRefundedAmount",
                table: "PaymentRefunds",
                columns: new[] { "PaymentId", "CumulativeRefundedAmount" },
                unique: true);

            // Freeze the old approximation only for currently approved legacy payments.
            // Refunded/charged-back records have no reliable original approval date.
            migrationBuilder.Sql("UPDATE Payments SET ApprovedAt = COALESCE(UpdatedAt, CreatedAt), ApprovalDateSource = 2 WHERE Status = 2");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentRefunds");

            migrationBuilder.DropIndex(
                name: "IX_Payments_ApprovedAt",
                table: "Payments");

            // Native SQLite DROP COLUMN preserves unmapped historical columns. An EF
            // table rebuild would reconstruct only the columns in the model snapshot.
            migrationBuilder.Sql("ALTER TABLE Payments DROP COLUMN ApprovalDateSource");
            migrationBuilder.Sql("ALTER TABLE Payments DROP COLUMN ApprovedAt");
            migrationBuilder.Sql("ALTER TABLE Payments DROP COLUMN RefundTrackingStartedAt");
            migrationBuilder.Sql("ALTER TABLE Payments DROP COLUMN RefundedAmount");
        }
    }
}
