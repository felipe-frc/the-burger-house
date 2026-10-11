using BurgerHouse.Infrastructure.Privacy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace BurgerHouse.Infrastructure.Persistence;

public sealed class BurgerHouseDbContextFactory : IDesignTimeDbContextFactory<BurgerHouseDbContext>
{
    public BurgerHouseDbContext CreateDbContext(string[] args) => new(
        new DbContextOptionsBuilder<BurgerHouseDbContext>().UseSqlite(
            Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection") ?? "Data Source=burgerhouse.db").Options,
        new AesGcmPersonalDataProtector(Environment.GetEnvironmentVariable("Privacy__EncryptionKey")));
}
