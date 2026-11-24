namespace BurgerHouse.Domain.Entities;

public sealed class AdminUser
{
    private AdminUser() { }
    public int Id { get; private set; }
    public string Email { get; private set; } = "";
    public string PasswordHash { get; private set; } = "";
    public AdminUser(string email, string passwordHash)
    {
        ChangeEmail(email);
        if (string.IsNullOrWhiteSpace(passwordHash)) throw new ArgumentException("Hash required.");
        PasswordHash = passwordHash;
    }
    public void ChangeEmail(string email)
    {
        var normalized = email.Trim().ToUpperInvariant();
        if (normalized.Length > 254 || !System.Net.Mail.MailAddress.TryCreate(normalized, out var address) || address.Address != normalized)
            throw new ArgumentException("Invalid email.");
        Email = normalized;
    }
    public void ReplaceHash(string hash) => PasswordHash = hash;
}
public sealed class AdminSession
{
    public string Id { get; set; } = "";
    public int AdminUserId { get; set; }
    public DateTime ExpiresAt { get; set; }
}
