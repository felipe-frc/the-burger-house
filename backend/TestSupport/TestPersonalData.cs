using System.Security.Cryptography;
using BurgerHouse.Infrastructure.Privacy;

// Linked only into test assemblies; never registered or referenced by production.
internal static class TestPersonalData
{
    internal static readonly string Key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    internal static readonly AesGcmPersonalDataProtector Protector = new(Key);
}
