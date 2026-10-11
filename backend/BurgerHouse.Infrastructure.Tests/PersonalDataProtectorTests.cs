using System.Security.Cryptography;
using BurgerHouse.Infrastructure.Privacy;

namespace BurgerHouse.Infrastructure.Tests;

public class PersonalDataProtectorTests
{
    private static AesGcmPersonalDataProtector Create() => new(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("52998224725")]
    [InlineData("Observação: pão, açúcar e 🍔")]
    public void RoundtripPreservesNullEmptyAndUnicode(string? value)
    {
        var protector = Create();
        var stored = protector.Protect(value, "Orders.Observation");
        Assert.Equal(value, protector.Unprotect(stored, "Orders.Observation"));
        if (value is null) Assert.Null(stored);
        else { Assert.StartsWith("enc:v1:", stored); Assert.NotEqual(value, stored); }
    }

    [Fact]
    public void EachWriteUsesAnIndependentNonce()
    {
        var protector = Create();
        Assert.NotEqual(protector.Protect("same", "field"), protector.Protect("same", "field"));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(12)]
    [InlineData(30)]
    public void TamperedNonceCiphertextOrTagFailsWithoutLeakingValues(int offset)
    {
        var protector = Create();
        var encoded = protector.Protect("52998224725", "Orders.CustomerTaxId")!;
        var bytes = Convert.FromBase64String(encoded[7..]);
        bytes[offset] ^= 1;
        var tampered = "enc:v1:" + Convert.ToBase64String(bytes);
        var error = Assert.Throws<CryptographicException>(() => protector.Unprotect(tampered, "Orders.CustomerTaxId"));
        Assert.Equal("Personal data could not be decrypted or authenticated.", error.Message);
        Assert.Null(error.InnerException);
        Assert.DoesNotContain(tampered, error.ToString());
        Assert.DoesNotContain("52998224725", error.ToString());
    }

    [Theory]
    [InlineData("enc:v2:AAAA")]
    [InlineData("enc:v1:not-base64")]
    [InlineData("enc:v1:AA==")]
    [InlineData("enc:")]
    public void ReservedMalformedEnvelopesAreNeverTreatedAsLegacy(string value) =>
        Assert.Throws<CryptographicException>(() => Create().Unprotect(value, "field"));

    [Fact]
    public void WrongKeyOrFieldFailsAuthentication()
    {
        var protector = Create();
        var value = protector.Protect("private", "Orders.CustomerEmail");
        Assert.Throws<CryptographicException>(() => Create().Unprotect(value, "Orders.CustomerEmail"));
        Assert.Throws<CryptographicException>(() => protector.Unprotect(value, "Orders.CustomerPhone"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-key")]
    [InlineData("AA==")]
    public void InvalidKeyIsRejectedWithoutEchoingConfiguration(string? value)
    {
        var error = Assert.Throws<InvalidOperationException>(() => new AesGcmPersonalDataProtector(value));
        Assert.Equal("Privacy:EncryptionKey must be canonical Base64 for a 32-byte key.", error.Message);
        Assert.Null(error.InnerException);
    }

    [Fact]
    public void WrongSizeAndNonCanonicalKeyAreRejected()
    {
        Assert.Throws<InvalidOperationException>(() => new AesGcmPersonalDataProtector(Convert.ToBase64String(RandomNumberGenerator.GetBytes(16))));
        Assert.Throws<InvalidOperationException>(() => new AesGcmPersonalDataProtector(" " + TestPersonalData.Key));
    }

    [Fact]
    public void LegacyPlaintextIsReadableWithoutChangingItsContent() =>
        Assert.Equal(" legado ç ", Create().Unprotect(" legado ç ", "Orders.Street"));
}
