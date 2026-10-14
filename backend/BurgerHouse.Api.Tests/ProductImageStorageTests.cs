using BurgerHouse.Api.Images;
using SkiaSharp;

namespace BurgerHouse.Api.Tests;

public sealed class ProductImageStorageTests
{
    [Theory]
    [InlineData(SKEncodedImageFormat.Jpeg)]
    [InlineData(SKEncodedImageFormat.Png)]
    [InlineData(SKEncodedImageFormat.Webp)]
    public async Task SavesRealImagesAsWebp(SKEncodedImageFormat format)
    {
        var directory = TemporaryDirectory();

        try
        {
            var storage = new ProductImageStorage(directory);
            var original = CreateImage(format);

            var first = await storage.SaveAsync(
                new MemoryStream(original),
                original.Length);

            var second = await storage.SaveAsync(
                new MemoryStream(original),
                original.Length);

            Assert.Matches(
                @"\A/api/product-images/[a-f0-9]{32}\.webp\z",
                first);

            Assert.NotEqual(first, second);

            var files = Directory.GetFiles(directory);

            Assert.Equal(2, files.Length);

            var saved = await File.ReadAllBytesAsync(
                Path.Combine(directory, Path.GetFileName(first)));

            using var decoded = SKBitmap.Decode(saved);

            Assert.NotNull(decoded);
            Assert.Equal(16, decoded.Width);
            Assert.Equal(16, decoded.Height);
        }
        finally
        {
            RemoveDirectory(directory);
        }
    }

    [Theory]
    [InlineData("empty")]
    [InlineData("text")]
    [InlineData("svg")]
    [InlineData("fake-jpeg")]
    public async Task RejectsInvalidImageContents(string kind)
    {
        var directory = TemporaryDirectory();

        try
        {
            var storage = new ProductImageStorage(directory);

            var content = kind switch
            {
                "empty" => Array.Empty<byte>(),
                "text" => "not an image"u8.ToArray(),
                "svg" => "<svg></svg>"u8.ToArray(),
                _ => new byte[]
                {
                    0xFF, 0xD8, 0xFF, 0xE0,
                    0x00, 0x02, 0xFF, 0xD9
                }
            };

            if (content.Length == 0)
            {
                await Assert.ThrowsAsync<ArgumentException>(
                    () => storage.SaveAsync(
                        new MemoryStream(content),
                        content.Length));
            }
            else
            {
                await Assert.ThrowsAsync<InvalidDataException>(
                    () => storage.SaveAsync(
                        new MemoryStream(content),
                        content.Length));
            }

            Assert.False(Directory.Exists(directory));
        }
        finally
        {
            RemoveDirectory(directory);
        }
    }

    [Fact]
    public async Task RejectsFilesLargerThanFiveMegabytes()
    {
        var directory = TemporaryDirectory();

        try
        {
            var storage = new ProductImageStorage(directory);

            await Assert.ThrowsAsync<ArgumentException>(
                () => storage.SaveAsync(
                    new MemoryStream(new byte[1]),
                    ProductImageStorage.MaximumFileSize + 1L));

            Assert.False(Directory.Exists(directory));
        }
        finally
        {
            RemoveDirectory(directory);
        }
    }

    [Fact]
    public async Task RejectsIncorrectDeclaredLength()
    {
        var directory = TemporaryDirectory();

        try
        {
            var storage = new ProductImageStorage(directory);
            var content = CreateImage(SKEncodedImageFormat.Png);

            await Assert.ThrowsAsync<InvalidDataException>(
                () => storage.SaveAsync(
                    new MemoryStream(content),
                    content.Length - 1));

            Assert.False(Directory.Exists(directory));
        }
        finally
        {
            RemoveDirectory(directory);
        }
    }

    [Fact]
    public async Task RejectsExcessiveImageDimensions()
    {
        var directory = TemporaryDirectory();

        try
        {
            var storage = new ProductImageStorage(directory);

            var content = CreateImage(
                SKEncodedImageFormat.Png,
                ProductImageStorage.MaximumDimension + 1,
                1);

            await Assert.ThrowsAsync<InvalidDataException>(
                () => storage.SaveAsync(
                    new MemoryStream(content),
                    content.Length));

            Assert.False(Directory.Exists(directory));
        }
        finally
        {
            RemoveDirectory(directory);
        }
    }

    [Fact]
    public async Task RejectedUploadDoesNotRemovePreviouslySavedImage()
    {
        var directory = TemporaryDirectory();

        try
        {
            var storage = new ProductImageStorage(directory);
            var content = CreateImage(SKEncodedImageFormat.Png);

            var path = await storage.SaveAsync(
                new MemoryStream(content),
                content.Length);

            await Assert.ThrowsAsync<InvalidDataException>(
                () => storage.SaveAsync(
                    new MemoryStream("invalid"u8.ToArray()),
                    7));

            Assert.True(
                File.Exists(
                    Path.Combine(directory, Path.GetFileName(path))));

            Assert.Single(Directory.GetFiles(directory));
        }
        finally
        {
            RemoveDirectory(directory);
        }
    }

    private static byte[] CreateImage(
        SKEncodedImageFormat format,
        int width = 16,
        int height = 16)
    {
        using var bitmap = new SKBitmap(width, height);

        bitmap.Erase(SKColors.Orange);

        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(format, 90);

        Assert.NotNull(encoded);

        return encoded.ToArray();
    }

    private static string TemporaryDirectory() =>
        Path.Combine(
            Path.GetTempPath(),
            $"burgerhouse-image-storage-{Guid.NewGuid():N}");

    private static void RemoveDirectory(string directory)
    {
        if (Directory.Exists(directory))
            Directory.Delete(directory, recursive: true);
    }
}