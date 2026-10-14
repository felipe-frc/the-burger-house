using SkiaSharp;

namespace BurgerHouse.Api.Images;

public sealed class ProductImageStorage
{
    public const int MaximumFileSize = 5 * 1024 * 1024;
    public const int MaximumDimension = 4096;
    public const long MaximumPixels = 16_000_000;

    private readonly string _directory;

    public ProductImageStorage(string directory)
    {
        if (string.IsNullOrWhiteSpace(directory))
            throw new ArgumentException(
                "Image directory is required.",
                nameof(directory));

        _directory = Path.GetFullPath(directory);
    }

    public static string GetDefaultDirectory()
    {
        var azureSite = Environment.GetEnvironmentVariable(
            "WEBSITE_SITE_NAME");

        if (!string.IsNullOrWhiteSpace(azureSite))
        {
            var home = Environment.GetEnvironmentVariable("HOME");

            if (string.IsNullOrWhiteSpace(home))
                throw new InvalidOperationException(
                    "Azure persistent HOME directory is unavailable.");

            return Path.Combine(home, "product-images");
        }

        return Path.Combine(
            Path.GetTempPath(),
            "burgerhouse-product-images");
    }

    public async Task<string> SaveAsync(
        Stream source,
        long declaredLength,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(source);

        if (!source.CanRead)
            throw new ArgumentException(
                "Image stream must be readable.",
                nameof(source));

        if (declaredLength <= 0 || declaredLength > MaximumFileSize)
            throw new ArgumentException(
                "Invalid image size.",
                nameof(declaredLength));

        using var memory = new MemoryStream(
            (int)declaredLength);

        var buffer = new byte[81920];
        long total = 0;

        while (true)
        {
            var read = await source.ReadAsync(
                buffer.AsMemory(),
                cancellationToken);

            if (read == 0)
                break;

            total += read;

            if (total > MaximumFileSize ||
                total > declaredLength)
            {
                throw new InvalidDataException(
                    "Image exceeds the allowed size.");
            }

            await memory.WriteAsync(
                buffer.AsMemory(0, read),
                cancellationToken);
        }

        if (total != declaredLength)
            throw new InvalidDataException(
                "Image length does not match the upload.");

        cancellationToken.ThrowIfCancellationRequested();

        var bytes = memory.ToArray();

        using var imageStream = new SKMemoryStream(bytes);
        using var codec = SKCodec.Create(imageStream);

        if (codec is null)
            throw new InvalidDataException(
                "Image could not be decoded.");

        if (codec.EncodedFormat is not (
            SKEncodedImageFormat.Jpeg or
            SKEncodedImageFormat.Png or
            SKEncodedImageFormat.Webp))
        {
            throw new InvalidDataException(
                "Unsupported image format.");
        }
        var info = codec.Info;

        if (info.Width <= 0 ||
            info.Height <= 0 ||
            info.Width > MaximumDimension ||
            info.Height > MaximumDimension ||
            (long)info.Width * info.Height > MaximumPixels)
        {
            throw new InvalidDataException(
                "Image dimensions exceed the allowed limits.");
        }

        using var bitmap = SKBitmap.Decode(codec);

        if (bitmap is null)
            throw new InvalidDataException(
                "Image could not be decoded.");

        using var image = SKImage.FromBitmap(bitmap);

        if (image is null)
            throw new InvalidDataException(
                "Image processing failed.");

        // Re-encode decoded pixels instead of storing uploaded bytes.
        // WebP reduces storage and avoids copying original metadata.
        using var encoded = image.Encode(
            SKEncodedImageFormat.Webp,
            85);

        if (encoded is null ||
            encoded.Size <= 0 ||
            encoded.Size > MaximumFileSize)
        {
            throw new InvalidDataException(
                "Normalized image exceeds the allowed size.");
        }

        cancellationToken.ThrowIfCancellationRequested();

        var normalized = encoded.ToArray();

        Directory.CreateDirectory(_directory);

        var filename = $"{Guid.NewGuid():N}.webp";
        var fullPath = Path.Combine(_directory, filename);

        try
        {
            await using (var destination = new FileStream(
                fullPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                81920,
                FileOptions.Asynchronous))
            {
                await destination.WriteAsync(
                    normalized.AsMemory(),
                    cancellationToken);

                await destination.FlushAsync(
                    cancellationToken);
            }

            return $"/api/product-images/{filename}";
        }
        catch
        {
            if (File.Exists(fullPath))
                File.Delete(fullPath);

            throw;
        }
    }

    public Stream? OpenRead(string filename)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(
            filename,
            @"\A[a-f0-9]{32}\.webp\z"))
            return null;

        var path = Path.Combine(_directory, filename);

        try
        {
            return new FileStream(
                path,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read);
        }
        catch (FileNotFoundException)
        {
            return null;
        }
        catch (DirectoryNotFoundException)
        {
            return null;
        }
    }

    public void Delete(string? imageUrl)
    {
        const string prefix = "/api/product-images/";

        if (imageUrl is null ||
            !imageUrl.StartsWith(
                prefix,
                StringComparison.Ordinal))
            return;

        var filename = imageUrl.Substring(prefix.Length);

        if (!System.Text.RegularExpressions.Regex.IsMatch(
            filename,
            @"\A[a-f0-9]{32}\.webp\z"))
            return;

        var path = Path.Combine(_directory, filename);

        if (File.Exists(path))
            File.Delete(path);
    }
}