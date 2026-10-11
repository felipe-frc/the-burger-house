using System.Security.Cryptography;
using System.Text;
using BurgerHouse.Application.Abstractions.Persistence;

namespace BurgerHouse.Infrastructure.Privacy;

public sealed class AesGcmPersonalDataProtector : IPersonalDataProtector
{
    private const string Prefix = "enc:v1:";
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private readonly byte[] key;

    public AesGcmPersonalDataProtector(string? encryptionKey)
    {
        try
        {
            key = Convert.FromBase64String(encryptionKey ?? "");
            if (key.Length != 32 || Convert.ToBase64String(key) != encryptionKey)
                throw new FormatException();
        }
        catch (FormatException)
        {
            throw new InvalidOperationException("Privacy:EncryptionKey must be canonical Base64 for a 32-byte key.");
        }
    }

    public string? Protect(string? value, string purpose)
    {
        if (value is null) return null;
        ArgumentException.ThrowIfNullOrWhiteSpace(purpose);
        var plaintext = Utf8.GetBytes(value);
        try
        {
            var envelope = new byte[NonceSize + plaintext.Length + TagSize];
            RandomNumberGenerator.Fill(envelope.AsSpan(0, NonceSize));
            using var aes = new AesGcm(key, TagSize);
            aes.Encrypt(envelope.AsSpan(0, NonceSize), plaintext,
                envelope.AsSpan(NonceSize, plaintext.Length), envelope.AsSpan(NonceSize + plaintext.Length, TagSize),
                Utf8.GetBytes($"BurgerHouse:personal-data:v1:{purpose}"));
            return Prefix + Convert.ToBase64String(envelope);
        }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
    }

    public string? Unprotect(string? value, string purpose)
    {
        if (value is null || !value.StartsWith("enc:", StringComparison.Ordinal)) return value;
        ArgumentException.ThrowIfNullOrWhiteSpace(purpose);
        byte[]? plaintext = null;
        try
        {
            if (!value.StartsWith(Prefix, StringComparison.Ordinal)) throw new FormatException();
            var encoded = value[Prefix.Length..];
            var envelope = Convert.FromBase64String(encoded);
            if (envelope.Length < NonceSize + TagSize || Convert.ToBase64String(envelope) != encoded)
                throw new FormatException();
            plaintext = new byte[envelope.Length - NonceSize - TagSize];
            using var aes = new AesGcm(key, TagSize);
            aes.Decrypt(envelope.AsSpan(0, NonceSize), envelope.AsSpan(NonceSize, plaintext.Length),
                envelope.AsSpan(NonceSize + plaintext.Length, TagSize), plaintext,
                Utf8.GetBytes($"BurgerHouse:personal-data:v1:{purpose}"));
            return Utf8.GetString(plaintext);
        }
        catch (Exception error) when (error is FormatException or CryptographicException or DecoderFallbackException)
        {
            // Deliberately omit both the value and the inner exception from all diagnostics.
            throw new CryptographicException("Personal data could not be decrypted or authenticated.");
        }
        finally { if (plaintext is not null) CryptographicOperations.ZeroMemory(plaintext); }
    }
}
