using System.Security.Claims;
using BurgerHouse.Api.Controllers;
using BurgerHouse.Api.Images;
using BurgerHouse.Domain.Entities;
using BurgerHouse.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SkiaSharp;

namespace BurgerHouse.Api.Tests;

public sealed class ProductImagesControllerTests
{
    [Fact]
    public void RejectsUnsafePublicFilename()
    {
        var directory = NewDirectory();

        try
        {
            var storage = new ProductImageStorage(directory);
            var controller = new ProductImagesController(storage);

            Assert.IsType<NotFoundResult>(
                controller.Get("../../private.db"));

            Assert.False(Directory.Exists(directory));
        }
        finally
        {
            Cleanup(directory);
        }
    }

    [Fact]
    public async Task UploadsAndRemovesImageWithAudit()
    {
        var directory = NewDirectory();

        try
        {
            await using var connection = new SqliteConnection(
                "Data Source=:memory:");

            await connection.OpenAsync();

            var options =
                new DbContextOptionsBuilder<BurgerHouseDbContext>()
                    .UseSqlite(connection)
                    .Options;

            await using var db = new BurgerHouseDbContext(
                options,
                TestPersonalData.Protector);

            await db.Database.MigrateAsync();

            var owner = new AdminUser(
                "images-test@example.invalid",
                "test-hash");

            db.Add(owner);
            await db.SaveChangesAsync();

            var product = await db.Products
                .OrderBy(p => p.Id)
                .FirstAsync();

            var storage = new ProductImageStorage(directory);

            var controller = new ProductImagesAdminController(
                storage,
                new ProductImageAssignmentService(db),
                db,
                TimeProvider.System,
                NullLogger<ProductImagesAdminController>.Instance);

            controller.ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(
                        new ClaimsIdentity(
                            new[]
                            {
                                new Claim(
                                    ClaimTypes.NameIdentifier,
                                    owner.Id.ToString())
                            },
                            "test"))
                }
            };

            using var bitmap = new SKBitmap(16, 16);
            bitmap.Erase(SKColors.Red);

            using var image = SKImage.FromBitmap(bitmap);
            using var encoded = image.Encode(
                SKEncodedImageFormat.Png, 90);

            var bytes = encoded.ToArray();

            var file = new FormFile(
                new MemoryStream(bytes),
                0,
                bytes.Length,
                "file",
                "photo.png")
            {
                Headers = new HeaderDictionary(),
                ContentType = "image/png"
            };

            var result = await controller.Upload(
                product.Id, file, default);

            Assert.IsType<OkObjectResult>(result);

            await db.Entry(product).ReloadAsync();

            Assert.NotNull(product.ImageUrl);

            var filename = Path.GetFileName(product.ImageUrl);
            var saved = Path.Combine(directory, filename);

            Assert.True(File.Exists(saved));

            var publicController =
                new ProductImagesController(storage);

            var publicResult = publicController.Get(filename);

            var response = Assert.IsType<FileStreamResult>(
                publicResult);

            using (response.FileStream)
            {
                Assert.Equal(
                    "image/webp",
                    response.ContentType);

                Assert.True(response.FileStream.Length > 0);
            }

            Assert.Equal(
                1,
                await db.AdminAuditLogs.CountAsync(
                    a => a.Action == "ProductImageUpdated"));

            var removed = await controller.Remove(
                product.Id, default);

            Assert.IsType<NoContentResult>(removed);

            await db.Entry(product).ReloadAsync();

            Assert.Null(product.ImageUrl);
            Assert.False(File.Exists(saved));

            Assert.Equal(
                2,
                await db.AdminAuditLogs.CountAsync(
                    a => a.Action == "ProductImageUpdated"));
        }
        finally
        {
            Cleanup(directory);
        }
    }

    [Fact]
    public async Task InvalidImageDoesNotCreateFile()
    {
        var directory = NewDirectory();

        try
        {
            var storage = new ProductImageStorage(directory);

            var bytes = "invalid image"u8.ToArray();

            await Assert.ThrowsAsync<InvalidDataException>(
                () => storage.SaveAsync(
                    new MemoryStream(bytes),
                    bytes.Length));

            Assert.False(Directory.Exists(directory));
        }
        finally
        {
            Cleanup(directory);
        }
    }

    private static string NewDirectory() =>
        Path.Combine(
            Path.GetTempPath(),
            $"burgerhouse-image-api-{Guid.NewGuid():N}");

    private static void Cleanup(string directory)
    {
        if (Directory.Exists(directory))
            Directory.Delete(directory, recursive: true);
    }
}