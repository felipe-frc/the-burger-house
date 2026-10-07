namespace BurgerHouse.Domain.Entities;

public sealed class AdminUser
{
    private AdminUser() { }
    public int Id { get; private set; }
    public string Email { get; private set; } = "";
    public string PasswordHash { get; private set; } = "";
    public AdminUser(string email, string passwordHash)
    {
        Email = email.Trim().ToUpperInvariant();
        if (Email.Length > 254 || !System.Net.Mail.MailAddress.TryCreate(Email, out var address) || address.Address != Email)
            throw new ArgumentException("Invalid email.");
        if (string.IsNullOrWhiteSpace(passwordHash)) throw new ArgumentException("Hash required.");
        PasswordHash = passwordHash;
    }
    public void ReplaceHash(string hash) => PasswordHash = hash;
}
public sealed class AdminSession
{
    public string Id { get; set; } = "";
    public int AdminUserId { get; set; }
    public DateTime ExpiresAt { get; set; }
}
