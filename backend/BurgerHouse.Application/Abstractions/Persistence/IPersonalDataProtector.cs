namespace BurgerHouse.Application.Abstractions.Persistence;

public interface IPersonalDataProtector
{
    string? Protect(string? value, string purpose);
    string? Unprotect(string? value, string purpose);
}
